// Runs the validator on every page in this folder. A page in pass/ must pass
// every check. A page in fail/<check id>/ must fail that check and no other.
// To add a case, add a page; this file needs no edit.

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { checks, parsePage, validate } from "../../src/validate-output.ts";

// The bundle is what the skill ships, so the command-line tests run it.
const script = fileURLToPath(
  new URL("../../skills/explain-diff-html/scripts/validate-output.js", import.meta.url),
);
// Every case page links at 0123456789abcdef0123456789abcdef01234567.
const sha = "0123456";

function getFailedCheckIds(path: string): string[] {
  const document = parsePage(readFileSync(path, "utf8"));
  return validate({ document, sha })
    .filter(({ result }) => result.isFailed)
    .map(({ id }) => id);
}

function runScript(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
  return { status, stdout, stderr };
}

function getPages(folder: string): string[] {
  return readdirSync(folder)
    .filter((name) => name.endsWith(".html"))
    .map((name) => join(folder, name));
}

const passFolder = join(import.meta.dirname, "pass");
for (const path of getPages(passFolder)) {
  test(`pass/${basename(path)}`, () => {
    expect(getFailedCheckIds(path)).toEqual([]);
    const { status, stdout } = runScript(path, sha);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^pass: /m);
    expect(stdout).not.toMatch(/^FAIL: /m);
  });
}

const failFolder = join(import.meta.dirname, "fail");
const checkIds = readdirSync(failFolder, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const checkId of checkIds) {
  test(`fail/${checkId} names a check`, () => {
    expect(checks.map((check) => check.id)).toContain(checkId);
  });
  test(`fail/${checkId} has at least one page`, () => {
    expect(getPages(join(failFolder, checkId)).length).toBeGreaterThan(0);
  });
  for (const path of getPages(join(failFolder, checkId))) {
    test(`fail/${checkId}/${basename(path)}`, () => {
      expect(getFailedCheckIds(path)).toEqual([checkId]);
      const { status, stdout } = runScript(path, sha);
      expect(status).toBe(1);
      expect(stdout).toMatch(/^FAIL: /m);
    });
  }
}

test("an unlinked reference is listed by its text", () => {
  const path = join(failFolder, "unlinked-reference", "spare-srcref.html");
  const document = parsePage(readFileSync(path, "utf8"));
  const unlinked = validate({ document, sha }).find(({ id }) => id === "unlinked-reference");
  expect(unlinked?.result.isFailed ? unlinked.result.findings : []).toEqual(["b.py:9"]);
});

test("missing arguments print a usage line and exit 2", () => {
  const { status, stdout, stderr } = runScript();
  expect(status).toBe(2);
  expect(stderr).toMatch(/^usage: /m);
  expect(stdout).toBe("");
});

test("a short commit that is not lowercase hex prints a usage line and exits 2", () => {
  const { status, stderr } = runScript(join(passFolder, "baseline.html"), "ABC123");
  expect(status).toBe(2);
  expect(stderr).toMatch(/^usage: /m);
});

test("a directory instead of a page exits 1", () => {
  const { status, stderr } = runScript(passFolder, sha);
  expect(status).toBe(1);
  expect(stderr).toMatch(/^FAIL: /m);
});

test("a missing page exits 1", () => {
  const { status, stderr } = runScript(join(passFolder, "absent.html"), sha);
  expect(status).toBe(1);
  expect(stderr).toMatch(/^FAIL: /m);
});

test("a short commit over 40 characters prints a usage line and exits 2", () => {
  const { status, stderr } = runScript(join(passFolder, "baseline.html"), "a".repeat(41));
  expect(status).toBe(2);
  expect(stderr).toMatch(/^usage: /m);
});

test("a run prints the advisory block", () => {
  expect(runScript(join(passFolder, "baseline.html"), sha).stdout).toMatch(/^advisory: /m);
});

test("the advisory lists each ordinal with the rest of its sentence", () => {
  const { stdout } = runScript(join(passFolder, "advisory-ordinal.html"), sha);
  expect(stdout).toMatch(/^the second step in the flow\? Pick one$/m);
});

test("the counts line reports references, linked, and marked-bare", () => {
  const { stdout } = runScript(join(passFolder, "baseline.html"), sha);
  expect(stdout).toMatch(/^references=1 linked=1 marked-bare=0$/m);
});

// An installed copy takes its module type from the user's project unless
// scripts/package.json sets it.
test("an installed copy runs under a CommonJS project", () => {
  const project = mkdtempSync(join(tmpdir(), "validate-output-"));
  try {
    writeFileSync(join(project, "package.json"), '{ "type": "commonjs" }\n');
    const skill = join(project, ".claude", "skills", "explain-diff-html");
    cpSync(dirname(dirname(script)), skill, { recursive: true });
    const { status, stdout } = spawnSync(
      process.execPath,
      [join(skill, "scripts", basename(script)), join(passFolder, "baseline.html"), sha],
      { encoding: "utf8" },
    );
    expect(status).toBe(0);
    expect(stdout).toMatch(/^pass: /m);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
