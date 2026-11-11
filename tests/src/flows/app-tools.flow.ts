/**
 * APP-TOOLS-1: an App exposes tools. `apps.<slug>.tools` names an OpenAPI
 * document in the App's folder; a kortix.yaml sync makes it the connector
 * `app-<slug>`, and agents reach it through the same tool surface as every
 * connector. Maps to spec section "Apps".
 *
 * The local profile runs no App machine (no Platinum), so a call reaches the
 * App transport and stops there with `app_unavailable` (the App has no
 * serving release). That the App then receives the request with its caller
 * headers is proven by apps/app-tool-call.test.ts with a fake transport.
 */
import { flow } from "../core/flow";
import { openWorld, type AgentSession } from "../fixtures/agent-principals";

type Results = { results: Array<{ id: string; risk: string; description?: string }> };

const OPENAPI = (withoutOperationId = false) =>
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Notes", version: "1" },
    paths: {
      "/notes": {
        get: { operationId: "list_notes", summary: "List the team's saved notes" },
        post: withoutOperationId
          ? { summary: "Create a note" }
          : {
              operationId: "create_note",
              summary: "Create a note for the team",
              requestBody: {
                required: true,
                content: { "application/json": { schema: { type: "object", required: ["text"], properties: { text: { type: "string" } } } } },
              },
            },
      },
      "/notes/search": { post: { operationId: "search_notes", summary: "Search the team's notes by words", "x-kortix-risk": "read" } },
      "/notes/{id}": {
        delete: { operationId: "delete_note", summary: "Delete one note", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] },
      },
    },
  }, null, 2);

flow(
  "APP-TOOLS-1",
  {
    domain: "apps",
    requires: ["database"],
    timeoutMs: 180_000,
    routes: [
      "POST /v1/workspaces/:projectId/apps",
      "DELETE /v1/workspaces/:projectId/apps/:appId",
      "POST /v1/connectors/workspaces/:projectId/connectors/sync",
      "POST /v1/accounts/tokens",
      "POST /v1/agent-tools/:verb",
    ],
  },
  async (ctx) => {
    const { project, world } = await openWorld(ctx);
    const owner = ctx.client.as(ctx.P.OWNER);
    const params = { projectId: project.id };
    const slug = `notes${Date.now().toString(36)}`;
    const connector = `app-${slug}`;
    const tool = (op: string) => `connectors.${connector}.${op}`;
    let appId = "";
    let support: AgentSession | null = null;
    let other: AgentSession | null = null;
    const manifest = (tools: boolean) =>
      [
        "project:",
        "  name: ke2e-app-tools",
        "default_agent: kortix",
        "agents:",
        "  kortix:",
        "    kortix_permissions: all",
        "  support:",
        `    connectors: [${connector}]`,
        "  other:",
        "    connectors: []",
        "apps:",
        `  ${slug}:`,
        `    path: apps/${slug}`,
        ...(tools ? ["    tools: openapi.json"] : ["    labels: [notes]"]),
        "policies:",
        `  - match: ${connector}.create_note`,
        "    action: require_approval",
        "",
      ].join("\n");
    const sync = async () => {
      const r = await owner.post("/v1/connectors/workspaces/:projectId/connectors/sync", {}, { params });
      r.status(200);
      return r.json<{ synced: number; errors: Array<{ slug: string; error: string }> }>();
    };
    const verb = (session: AgentSession, name: string, body: Record<string, unknown>) =>
      ctx.client.as(ctx.P.ANON).post(`/v1/agent-tools/${name}?project_id=${project.id}`, body, {
        headers: { Authorization: `Bearer ${session.secret}`, "x-kortix-surface": "cli" },
      });
    const connectorRow = async () =>
      (await world.db.query<{ connector_id: string; provider_type: string; status: string; last_error: string | null }>(
        "SELECT connector_id, provider_type, status, last_error FROM kortix.connectors WHERE project_id = $1 AND slug = $2",
        [project.id, connector],
      )).rows[0] ?? null;

    try {
      await ctx.step("create the App, then commit kortix.yaml with apps.<slug>.tools and the App's openapi.json", async () => {
        const created = await owner.post("/v1/workspaces/:projectId/apps", { slug, name: "Notes" }, { params });
        created.status(201);
        appId = created.json<{ app_id: string }>().app_id;
        await world.commitToMain({ "kortix.yaml": manifest(true), [`apps/${slug}/openapi.json`]: OPENAPI() }, "ke2e APP-TOOLS-1: the notes App exposes tools");
      });

      await ctx.step("a sync materializes the connector app-<slug>: provider app, one project account, one action per operation bound to the App", async () => {
        const result = await sync();
        const own = result.errors.filter((error) => error.slug === connector);
        if (own.length) throw new Error(`sync errors: ${JSON.stringify(own)}`);
        const row = await connectorRow();
        if (row?.provider_type !== "app" || row.status !== "active") throw new Error(`connector: ${JSON.stringify(row)}`);
        const actions = await world.db.query<{ path: string; risk: string; binding: { kind: string; app: string; method: string; path: string } }>(
          "SELECT path, risk, binding FROM kortix.connector_actions WHERE connector_id = $1 ORDER BY path",
          [row.connector_id],
        );
        const got = actions.rows.map((a) => `${a.path}:${a.risk}:${a.binding.kind}:${a.binding.app}:${a.binding.method} ${a.binding.path}`);
        const want = [
          `create_note:write:app:${slug}:POST /notes`,
          `delete_note:destructive:app:${slug}:DELETE /notes/{id}`,
          `list_notes:read:app:${slug}:GET /notes`,
          `search_notes:read:app:${slug}:POST /notes/search`,
        ];
        if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`actions: ${JSON.stringify(got)}`);
        const accounts = await world.db.query<{ owner_type: string }>(
          "SELECT owner_type FROM kortix.connector_connections WHERE connector_id = $1",
          [row.connector_id],
        );
        if (accounts.rows.length !== 1 || accounts.rows[0]!.owner_type !== "project") throw new Error(`accounts: ${JSON.stringify(accounts.rows)}`);
      });

      await ctx.step("mint a session of the agent granted app-<slug> and one of an agent granted nothing", async () => {
        support = await world.mintAgentSession({ agent: "support", launcher: ctx.P.OWNER });
        other = await world.mintAgentSession({ agent: "other", launcher: ctx.P.OWNER });
      });

      await ctx.step("search finds connectors.app-<slug>.<operationId> with its risk; describe returns the merged input schema", async () => {
        const r = await verb(support!, "search", { query: "team notes", family: "connectors", limit: 10 });
        r.status(200);
        const results = r.json<Results>().results.filter((x) => x.id.startsWith(`connectors.${connector}.`));
        const risks = Object.fromEntries(results.map((x) => [x.id, x.risk]));
        for (const [op, risk] of [["list_notes", "read"], ["create_note", "write"], ["search_notes", "read"]] as const) {
          if (risks[tool(op)] !== risk) throw new Error(`${op}: ${JSON.stringify(results)}`);
        }
        const d = await verb(support!, "describe", { id: tool("create_note") });
        d.status(200).body().has("$.risk", "write").has("$.input_schema.properties.body.required[0]", "text");
        const del = await verb(support!, "describe", { id: tool("delete_note") });
        del.status(200).body().has("$.risk", "destructive").has("$.input_schema.properties.id.x-in", "path");
      });

      await ctx.step("call of a read goes to the App transport: the App has no serving release, so it answers app_unavailable and the call log has the row", async () => {
        const r = await verb(support!, "call", { id: tool("list_notes"), input: {} });
        const body = r.json<{ status: string; reason?: string; message?: string }>();
        const text = JSON.stringify(body);
        if (body.status !== "error" || !text.includes("app_unavailable") || !text.includes("no ready release")) throw new Error(`call: ${r.status} ${text.slice(0, 400)}`);
        const logged = await world.db.query<{ status: string; session_id: string | null }>(
          "SELECT c.status, c.session_id FROM kortix.connector_calls c JOIN kortix.connectors k ON k.connector_id = c.connector_id WHERE k.project_id = $1 AND k.slug = $2 AND c.action_path = $3",
          [project.id, connector, `${connector}.list_notes`],
        );
        if (!logged.rows.some((row) => row.status === "error" && row.session_id === support!.sessionId)) throw new Error(`call log: ${JSON.stringify(logged.rows)}`);
      });

      await ctx.step("a write held by the require_approval policy returns pending_approval and never reaches the App", async () => {
        const r = await verb(support!, "call", { id: tool("create_note"), input: { body: { text: "late delivery" } } });
        r.status(200).body().has("$.status", "pending_approval").exists("$.execution_id");
      });

      await ctx.step("an agent without app-<slug> in its connectors grant neither finds nor calls the App's tools", async () => {
        const r = await verb(other!, "search", { query: "team notes", family: "connectors", limit: 10 });
        r.status(200);
        if (r.json<Results>().results.some((x) => x.id.startsWith(`connectors.${connector}.`))) throw new Error(`other agent sees: ${r.text()}`);
        const call = await verb(other!, "call", { id: tool("list_notes"), input: {} });
        const body = call.json<{ status: string }>();
        if (body.status === "ok" || JSON.stringify(body).includes("app_unavailable")) throw new Error(`other agent call: ${call.text().slice(0, 300)}`);
      });

      await ctx.step("a document with an operation without operationId is refused: the sync error names the operation and the connector holds no tools", async () => {
        await world.commitToMain({ [`apps/${slug}/openapi.json`]: OPENAPI(true) }, "ke2e APP-TOOLS-1: an operation without operationId");
        const result = await sync();
        const own = result.errors.find((error) => error.slug === connector);
        if (!own?.error.includes("operation POST /notes has no operationId")) throw new Error(`sync errors: ${JSON.stringify(result.errors)}`);
        const row = await connectorRow();
        if (row?.status !== "error") throw new Error(`connector: ${JSON.stringify(row)}`);
      });

      await ctx.step("removing apps.<slug>.tools removes the connector on the next sync", async () => {
        await world.commitToMain({ "kortix.yaml": manifest(false) }, "ke2e APP-TOOLS-1: the App stops exposing tools");
        await sync();
        const row = await connectorRow();
        if (row) throw new Error(`connector still there: ${JSON.stringify(row)}`);
      });
    } finally {
      if (appId) await owner.del("/v1/workspaces/:projectId/apps/:appId", { params: { ...params, appId } }).catch(() => {});
      await world.close();
    }
  },
);

