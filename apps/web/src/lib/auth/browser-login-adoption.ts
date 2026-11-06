/** A legacy cookie is a routing hint only. Slot authentication remains server verified. */
export function savedSlotForLegacyUser(
  slots: ReadonlyArray<{ slot: string; user_id: string; needs_sign_in?: boolean }>,
  legacyUserId: string | null,
): string | null {
  if (legacyUserId)
    return slots.find((slot) => slot.user_id === legacyUserId && !slot.needs_sign_in)?.slot ?? null;
  return slots.length === 1 ? slots[0].slot : null;
}

/** This host route retires a legacy cookie without transferring its rotating credential. */
export async function retireLegacyBrowserSession(slot: string): Promise<void> {
  const response = await fetch('/api/auth/browser-logins/retire-legacy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slot }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Legacy retirement failed (${response.status})`);
}

/** Eligibility is not authentication: the route still verifies the legacy bearer before revocation. */
export function legacySessionMatchesSavedUser(legacyUserId: unknown, savedUserId: string): boolean {
  return typeof legacyUserId === 'string' && savedUserId.length > 0 && legacyUserId === savedUserId;
}
