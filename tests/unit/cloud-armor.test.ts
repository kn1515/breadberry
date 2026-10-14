import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const baseEnv = {
  ...process.env,
  GOOGLE_CLOUD_PROJECT: "test-project",
  CLOUD_ARMOR_DOMAIN: "breadberry.example.com",
  APP_ORIGIN: "",
  ALLOW_UNAUTHENTICATED: "true",
  SERVICE: "breadberry",
  REGION: "asia-northeast1",
  EDGE_NAME: "breadberry-edge",
};

test("edge preflight rejects unsafe origins and incompatible IAM before building", () => {
  for (const override of [
    { CLOUD_ARMOR_DOMAIN: "" },
    { CLOUD_ARMOR_DOMAIN: "https://breadberry.example.com" },
    { APP_ORIGIN: "https://old.example.com" },
    { ALLOW_UNAUTHENTICATED: "false" },
  ]) {
    const result = spawnSync("bash", ["scripts/deploy.sh"], {
      env: { ...baseEnv, ...override },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /gcloud|command not found/);
  }
});

for (const existing of [false, true]) {
  test(`edge ${existing ? "reconfiguration" : "creation"} enforces WAF before opening frontend`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "breadberry-edge-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const log = join(dir, "commands");
    writeFileSync(
      join(dir, "gcloud"),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$EDGE_TEST_LOG"
case "$*" in
  *"compute security-policies rules "*)
    for arg in "$@"; do
      if [[ "$arg" == --global ]]; then
        echo 'unrecognized arguments: --global' >&2
        exit 2
      fi
    done ;;
  *" list "*) [[ "$EDGE_TEST_EXISTING" == true ]] && echo breadberry-edge; exit 0 ;;
  *"value(rules.priority)"*) if [[ "$EDGE_TEST_EXISTING" == true ]]; then echo '1000;1010;2000;2147483647'; else echo 2147483647; fi ;;
  *"value(backends.group)"*) [[ "$EDGE_TEST_EXISTING" == true ]] && echo 'https://www.googleapis.com/compute/v1/projects/test-project/regions/asia-northeast1/networkEndpointGroups/breadberry-edge'; exit 0 ;;
  *"value(managed.domains)"*) echo breadberry.example.com ;;
  *"value(address)"*) echo 192.0.2.1 ;;
esac
`,
      { mode: 0o755 },
    );
    const result = spawnSync("bash", ["scripts/setup-cloud-armor.sh"], {
      env: {
        ...baseEnv,
        PATH: `${dir}:${process.env.PATH}`,
        EDGE_TEST_LOG: log,
        EDGE_TEST_EXISTING: String(existing),
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const commands = readFileSync(log, "utf8");
    assert.match(
      commands,
      new RegExp(
        `rules ${existing ? "update" : "create"} 1000 .*--no-preview .*sqli-v33-stable`,
      ),
    );
    assert.match(
      commands,
      new RegExp(
        `rules ${existing ? "update" : "create"} 1010 .*--no-preview .*xss-v33-stable`,
      ),
    );
    assert.match(commands, /--exceed-action=deny-429 --enforce-on-key=IP/);
    assert.match(
      commands,
      /beta compute security-policies update .*--json-parsing=STANDARD --request-body-inspection-size=64KB/,
    );
    assert.match(
      commands,
      /--ingress=internal-and-cloud-load-balancing --no-default-url/,
    );
    assert.match(
      commands,
      /--update-env-vars=APP_ORIGIN=https:\/\/breadberry.example.com/,
    );
    assert.doesNotMatch(commands, /--health-checks|--timeout/);
    if (existing) {
      assert.doesNotMatch(commands, / create |add-backend/);
    } else {
      assert.match(
        commands,
        /network-endpoint-groups create .*--region=asia-northeast1/,
      );
      assert.ok(
        commands.indexOf("--security-policy=breadberry-edge") <
          commands.indexOf("forwarding-rules create"),
      );
    }
  });
}

test("Compute permission failure aborts provisioning without creating resources", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "breadberry-edge-error-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, "gcloud"),
    "#!/usr/bin/env bash\necho permission-denied >&2\nexit 9\n",
    { mode: 0o755 },
  );
  const result = spawnSync("bash", ["scripts/setup-cloud-armor.sh"], {
    env: { ...baseEnv, PATH: `${dir}:${process.env.PATH}` },
    encoding: "utf8",
  });
  assert.equal(result.status, 9);
  assert.match(result.stderr, /permission-denied/);
});
