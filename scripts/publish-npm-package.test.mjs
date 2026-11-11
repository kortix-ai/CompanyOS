import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./publish-npm-package.sh", import.meta.url),
);

function run(requireAuth) {
  const env = {
    ...process.env,
    VERSION: "0.0.0-test",
    REQUIRE_NPM_AUTH: requireAuth ? "1" : "0",
  };
  delete env.NODE_AUTH_TOKEN;
  delete env.ACTIONS_ID_TOKEN_REQUEST_URL;
  return spawnSync("bash", [script], { env, encoding: "utf8" });
}

const required = run(true);
if (
  required.status !== 1 ||
  !required.stdout.includes("required publication cannot continue")
) {
  console.error(required.stdout);
  console.error(required.stderr);
  throw new Error(
    "Required npm publication must fail closed when auth is unavailable",
  );
}

const optional = run(false);
if (optional.status !== 0 || !optional.stdout.includes("skipping publish")) {
  console.error(optional.stdout);
  console.error(optional.stderr);
  throw new Error(
    "Optional local npm publication must retain the no-auth skip behavior",
  );
}

// The registry must hold the staged bytes. A fake npm and bun on PATH stand in
// for the registry and the build; the stage script is a no-op stub.
function runPublish({ published, registrySha }) {
  const root = mkdtempSync(join(tmpdir(), "publish-npm-"));
  const pkg = join(root, "packages", "demo");
  const bin = join(root, "bin");
  mkdirSync(pkg, { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@kortix/demo", version: "0.0.0", scripts: { build: "true" } }));
  writeFileSync(join(root, "scripts", "stage-npm-publish.mjs"), "");
  const log = join(root, "npm.log");
  writeFileSync(
    join(bin, "npm"),
    `#!/usr/bin/env bash
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  install) exit 0 ;;
  --version) echo 11.6.0 ;;
  pack) dest="$4"; printf x > "$dest/kortix-demo-0.0.0.tgz"; echo '[{"filename":"kortix-demo-0.0.0.tgz","shasum":"stagedsha"}]' ;;
  view) if [ "$3" = "version" ]; then ${published ? 'echo 0.0.0-test' : 'exit 1'}; else echo ${JSON.stringify(registrySha)}; fi ;;
  publish) exit 0 ;;
esac
`,
  );
  writeFileSync(join(bin, "bun"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(bin, "npm"), 0o755);
  chmodSync(join(bin, "bun"), 0o755);
  const env = { ...process.env, VERSION: "0.0.0-test", NODE_AUTH_TOKEN: "test", PATH: `${bin}:${process.env.PATH}` };
  const r = spawnSync("bash", [script], { env, cwd: pkg, encoding: "utf8" });
  return { ...r, npm: readFileSync(log, "utf8") };
}

const mismatch = runPublish({ published: false, registrySha: "othersha" });
if (mismatch.status !== 1 || !mismatch.stdout.includes("the registry serves sha1 'othersha'")) {
  console.error(mismatch.stdout, mismatch.stderr);
  throw new Error("A registry tarball that differs from the staged one must fail the publish");
}
const match = runPublish({ published: false, registrySha: "stagedsha" });
if (match.status !== 0 || !match.stdout.includes("registry sha1 matches") || !/publish .*kortix-demo-0\.0\.0\.tgz/.test(match.npm)) {
  console.error(match.stdout, match.stderr, match.npm);
  throw new Error("The staged tarball itself must be published and verified");
}
const rerun = runPublish({ published: true, registrySha: "othersha" });
if (rerun.status !== 0 || !rerun.stdout.includes("::warning::") || /^publish /m.test(rerun.npm)) {
  console.error(rerun.stdout, rerun.stderr, rerun.npm);
  throw new Error("An idempotent re-run must skip publishing and warn on different bytes");
}

console.log("publish-npm-package.test: 5 assertions passed");
