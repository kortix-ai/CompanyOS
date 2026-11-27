/**
 * The credit reservation and the key injection of a billed web-service call
 * (`billed-proxy.ts`). The router's proxy helpers re-export them.
 */
import { HTTPException } from 'hono/http-exception';
import { getToolCost } from '../../config';
import { logger } from '../../lib/logger';
import { type ProxyServiceConfig, matchAllowedRoute } from '../config/proxy-services';
import { deductToolAmount, deductToolCredits } from './billing';
import { refundReservation } from './reservation';

export { matchAllowedRoute };

export interface ToolCreditReservation {
  accountId: string;
  billingToolName: string;
  cost: number;
}

export async function reserveToolProxyCredits(
  accountId: string,
  billingToolName: string,
  description: string,
): Promise<ToolCreditReservation | null> {
  const expectedCost = getToolCost(billingToolName, 0);
  if (expectedCost <= 0) return null;

  let creditReservation: Awaited<ReturnType<typeof deductToolCredits>>;
  try {
    creditReservation = await deductToolCredits(
      accountId,
      billingToolName,
      0,
      description,
      undefined,
      { skipDevCheck: true },
    );
  } catch (error) {
    throw new HTTPException(402, {
      message: error instanceof Error ? error.message : 'Insufficient credits',
    });
  }
  if (!creditReservation.success) {
    throw new HTTPException(creditReservation.retryable ? 503 : 402, {
      message: creditReservation.error || 'Insufficient credits',
    });
  }

  return {
    accountId,
    billingToolName,
    cost: creditReservation.cost,
  };
}

export async function refundToolReservation(
  reservation: ToolCreditReservation | null,
  description: string,
): Promise<void> {
  await refundReservation(reservation, 'tool_reservation_refund', description);
}

export function injectApiKey(
  service: ProxyServiceConfig,
  headers: Headers,
  body: ArrayBuffer | string | undefined,
): ArrayBuffer | string | undefined {
  const injection = service.keyInjection;
  const key = service.getKortixApiKey();

  switch (injection.type) {
    case 'header': {
      const value = injection.prefix ? `${injection.prefix}${key}` : key;
      headers.set(injection.headerName, value);
      return body;
    }

    case 'json_body_field': {
      if (!body) return body;
      try {
        const text = typeof body === 'string' ? body : new TextDecoder().decode(body);
        const json = JSON.parse(text);
        json[injection.field] = key;
        const newBody = JSON.stringify(json);
        headers.set('Content-Length', new TextEncoder().encode(newBody).length.toString());
        return newBody;
      } catch {
        logger.warn(`[PROXY] Could not inject API key into body for ${service.name}`);
        return body;
      }
    }

    default:
      return body;
  }
}

/**
 * Reserve an exact amount (USD) for a call priced per call, before it runs:
 * 402 when the account cannot cover it. Settle afterwards with
 * {@link settleToolAmount}.
 */
export async function reserveToolAmount(accountId: string, cost: number, description: string): Promise<ToolCreditReservation | null> {
  if (cost <= 0) return null;
  const result = await deductToolAmount(accountId, cost, description);
  if (!result.success) {
    throw new HTTPException(result.retryable ? 503 : 402, { message: result.error || 'Insufficient credits' });
  }
  return result.cost > 0 ? { accountId, billingToolName: 'toolbox_catalog', cost: result.cost } : null;
}

/**
 * Settle a reservation on the real cost: refund what was held beyond it, or
 * debit the rest when the call cost more (best effort: the call already ran).
 */
export async function settleToolAmount(reservation: ToolCreditReservation | null, actual: number, description: string): Promise<void> {
  if (!reservation) return;
  if (actual < reservation.cost) {
    await refundToolReservation({ ...reservation, cost: reservation.cost - actual }, `${description} (refund above the real cost)`);
  } else if (actual > reservation.cost) {
    const extra = await deductToolAmount(reservation.accountId, actual - reservation.cost, `${description} (above the hold)`);
    if (!extra.success) logger.warn('[TOOLBOX] could not debit the cost above the hold', { accountId: reservation.accountId, extra: actual - reservation.cost });
  }
}
