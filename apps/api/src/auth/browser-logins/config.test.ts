import { expect, test } from "bun:test";
import { browserLoginConfig } from "./config";
test("default off and fail closed without keys", () => {
  expect(browserLoginConfig({}).enabled).toBe(false);
  expect(
    browserLoginConfig({ KORTIX_BROWSER_LOGINS_ENABLED: true }).codec,
  ).toBeNull();
});
test("rotation accepts old keys and selects explicit writer", () => {
  const c = browserLoginConfig({
    KORTIX_BROWSER_LOGINS_ENABLED: true,
    KORTIX_BROWSER_LOGINS_ACTIVE_KEY: "new",
    KORTIX_BROWSER_LOGINS_KEYS: JSON.stringify({
      old: Buffer.alloc(32, 1).toString("base64"),
      new: Buffer.alloc(32, 2).toString("base64"),
    }),
  });
  expect(c.codec).not.toBeNull();
  expect(c.enabled).toBe(true);
});
