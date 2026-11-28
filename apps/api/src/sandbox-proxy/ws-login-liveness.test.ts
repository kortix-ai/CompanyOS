import { afterEach, expect, spyOn, test } from "bun:test";
import * as auth from "./preview-auth";
import * as partition from "./preview-partition";
import * as upstream from "./forward/ws-upstream";
import { preparePreviewWsUpgrade } from "./ws-proxy";
const restores: Array<() => void> = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
});
test("an established browser PTY loses access when its login is removed", async () => {
  let live = true;
  for (const spy of [
    spyOn(auth, "authenticatePreviewPrincipalDetailed").mockResolvedValue({
      userId: "synthetic-user",
      sessionId: null,
      principalKind: "user",
      loginSessionId: "synthetic-login",
    }),
    spyOn(partition, "previewLoginSessionLive").mockImplementation(
      async () => live,
    ),
    spyOn(upstream, "resolvePreviewWsUpstream").mockResolvedValue({
      ok: true,
      url: "wss://synthetic.invalid/ws",
      headers: {},
      accessCheck: async () => true,
    }),
  ])
    restores.push(() => spy.mockRestore());
  const result = await preparePreviewWsUpgrade(
    new URL(
      "http://localhost/v1/p/synthetic/8000/kortix/pty/synthetic/connect?token=synthetic",
    ),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error("upgrade rejected");
  expect(await result.data.accessCheck!()).toBe(true);
  live = false;
  expect(await result.data.accessCheck!()).toBe(false);
});
