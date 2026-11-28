import { __setGoTrueFetch } from "../../auth/gotrue";
// A separate replica for the PostgreSQL refresh contract test.
import { Hono } from "hono";
import {
  browserLoginRouter,
  registerBrowserLoginRoutes,
} from "../../auth/browser-logins/routes";
registerBrowserLoginRoutes();
const app = new Hono().route("/v1/auth/browser-logins", browserLoginRouter);
const server = Bun.serve({ port: 0, fetch: app.fetch });
process.stdout.write(JSON.stringify({ port: server.port }) + "\n");

if (process.env.BROWSER_LOGIN_KILL_DRILL === "1")
  __setGoTrueFetch(async () => {
    process.stdout.write(JSON.stringify({ refreshEntered: true }) + "\n");
    return new Promise<Response>(() => {});
  });
if (process.env.BROWSER_LOGIN_SWEEP_ONCE === "1") {
  const { sweepBrowserLogins } =
    await import("../../auth/browser-logins/service");
  await sweepBrowserLogins();
  server.stop(true);
  process.exit(0);
}
