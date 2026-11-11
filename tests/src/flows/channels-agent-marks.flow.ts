/**
 * An agent's face as a PNG — spec §CHN (CHN-35). Slack shows it beside every
 * post an agent makes (`icon_url`). The route is public and reads nothing: the
 * picture is a pure function of the slug.
 */
import { flow } from "../core/flow";

flow(
  "CHN-35",
  {
    domain: "channels",
    routes: ["GET /v1/agent-marks/:file"],
  },
  async (ctx) => {
    await ctx.step("ANON reads My Kortix's face → 200 image/png, cached for a year", async () => {
      const r = await ctx.client.as(ctx.P.ANON).get("/v1/agent-marks/mykortix.png");
      r.status(200).headerEquals("content-type", "image/png").headerEquals("cache-control", /immutable/);
      // The PNG signature: the first bytes Slack checks before it stores the picture.
      if (!r.text().includes("PNG")) throw new Error("CHN-35: the body is not a PNG");
    });
    await ctx.step("a named agent has a face of its own → 200", async () => {
      const r = await ctx.client.as(ctx.P.ANON).get("/v1/agent-marks/session-reviewer.png");
      r.status(200).headerEquals("content-type", "image/png");
    });
    await ctx.step("a path, an upper-case name or a missing .png is not a slug → 404", async () => {
      for (const file of ["..%2Fsecrets.png", "MyKortix.png", "mykortix", "mykortix.svg"]) {
        await ctx.client.as(ctx.P.ANON).get(`/v1/agent-marks/${file}`).then((r) => r.status(404));
      }
    });
  },
);
