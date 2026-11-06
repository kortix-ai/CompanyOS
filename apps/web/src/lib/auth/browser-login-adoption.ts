/** A legacy cookie is a routing hint only. Slot authentication remains server verified. */
export function savedSlotForLegacyUser(
  slots: ReadonlyArray<{ slot: string; user_id: string }>,
  legacyUserId: string | null,
): string | null {
  if (legacyUserId) return slots.find((slot) => slot.user_id === legacyUserId)?.slot ?? null;
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
