import { type ApiClient, ApiError } from '../api/client.ts';

/** One entry of the picker `claudeSubscription` group (routes/models.ts). */
export interface SubscriptionPickerModel {
  id: string;
  /** The caller may use this model through a Claude account. */
  connected?: boolean;
  /** Project model settings allow the model; display-only. */
  enabled?: boolean;
}

/** The picker catalog the CLI reads: gateway `models` plus the separate
 * Claude subscription group, which is never in `models`. */
export interface ModelPickerCatalog {
  models: Record<string, unknown>;
  claudeSubscription?: {
    connected?: boolean;
    models?: SubscriptionPickerModel[];
  };
}

/** Subscription models the caller may use through a Claude account.
 * Enablement is display-only: a hidden model can still run. */
export function connectedSubscriptionModels(
  catalog: ModelPickerCatalog,
): SubscriptionPickerModel[] {
  return (catalog.claudeSubscription?.models ?? []).filter((model) => model.connected === true);
}

/** The server's picker catalog includes only models connected for this caller.
 * Enablement is display-only: a hidden model can still run. */
export async function requireConnectedModel(client: ApiClient, projectId: string): Promise<void> {
  let catalog: ModelPickerCatalog;
  try {
    catalog = await client.get(`/workspaces/${projectId}/model-picker`);
  } catch (error) {
    // Native-provider projects and older self-hosted APIs have no gateway picker.
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
  const connected =
    Object.keys(catalog.models ?? {}).length + connectedSubscriptionModels(catalog).length;
  if (connected === 0) {
    throw new Error(
      'No model connected — connect one to start chatting. Run `kortix models ls` to check model access.',
    );
  }
}
