// Runs validate-output.ts on every page in this folder. A page in pass/ must
// pass every check. A page in fail/<check id>/ must fail that check and no other.
// To add a case, add a page; this file needs no edit.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checks,
  parsePage,
  validate,
} from "../../skills/explain-diff-html/scripts/validate-output.ts";

const script = fileURLToPath(
  new URL("../../skills/explain-diff-html/scripts/validate-output.ts", import.meta.url),
);
// Every case page links at 0123456789abcdef0123456789abcdef01234567.
const sha = "0123456";

function getFailedCheckIds(path: string): string[] {
  const document = parsePage(readFileSync(path, "utf8"));
  return validate({ document, sha })
    .filter(({ result }) => result.isFailed)
    .map(({ id }) => id);
}

function runScript(...args: string[]): number | null {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" }).status;
}

function getPages(folder: string): string[] {
  return readdirSync(folder)
    .filter((name) => name.endsWith(".html"))
    .map((name) => join(folder, name));
}

const passFolder = join(import.meta.dirname, "pass");
for (const path of getPages(passFolder)) {
  test(`pass/${basename(path)}`, () => {
    assert.deepEqual(getFailedCheckIds(path), []);
    assert.equal(runScript(path, sha), 0);
  });
}

const failFolder = join(import.meta.dirname, "fail");
const checkIds = readdirSync(failFolder, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const checkId of checkIds) {
  test(`fail/${checkId} names a check`, () => {
    assert.ok(checks.some((check) => check.id === checkId));
  });
  for (const path of getPages(join(failFolder, checkId))) {
    test(`fail/${checkId}/${basename(path)}`, () => {
      assert.deepEqual(getFailedCheckIds(path), [checkId]);
      assert.equal(runScript(path, sha), 1);
    });
  }
}

test("an unlinked reference is listed by its text", () => {
  const path = join(failFolder, "unlinked-reference", "spare-srcref.html");
  const document = parsePage(readFileSync(path, "utf8"));
  const unlinked = validate({ document, sha }).find(({ id }) => id === "unlinked-reference");
  assert.deepEqual(unlinked?.result.isFailed ? unlinked.result.findings : [], ["b.py:9"]);
});

test("missing arguments exit 2", () => {
  assert.equal(runScript(), 2);
});

test("a short commit that is not lowercase hex exits 2", () => {
  assert.equal(runScript(join(passFolder, "baseline.html"), "ABC123"), 2);
});

test("a directory instead of a page exits 1", () => {
  assert.equal(runScript(passFolder, sha), 1);
});
