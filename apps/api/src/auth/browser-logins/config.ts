import { createBrowserCredentialCodec } from "./credentials";
export function browserLoginConfig(env: {
  KORTIX_BROWSER_LOGINS_ENABLED?: boolean;
  KORTIX_BROWSER_LOGINS_ACTIVE_KEY?: string;
  KORTIX_BROWSER_LOGINS_KEYS?: string;
}) {
  let codec: ReturnType<typeof createBrowserCredentialCodec> | null = null;
  try {
    const raw = JSON.parse(env.KORTIX_BROWSER_LOGINS_KEYS ?? "{}");
    const keys: Record<string, Uint8Array> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value))
        throw Error();
      keys[id] = Buffer.from(value, "base64");
    }
    codec = createBrowserCredentialCodec(
      env.KORTIX_BROWSER_LOGINS_ACTIVE_KEY ?? "",
      keys,
    );
  } catch {
    /* Missing or malformed key configuration disables credential operations. */
  }
  return {
    enabled: env.KORTIX_BROWSER_LOGINS_ENABLED === true,
    codec,
    maxIdentities: 5,
    idleDays: 30,
    absoluteDays: 90,
    attemptMinutes: 5,
  };
}
