import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateReportText } from "../scripts/validate-project-coordination.js";

const task195Report = await readFile(
  new URL("../reports/replay-wide-hard-challenger-census-task195.md", import.meta.url),
  "utf8",
);

test("a factual null explanation is not an unresolved report placeholder", () => {
  assert.match(task195Report, /commitSha` to null/u);
  assert.deepEqual(validateReportText(task195Report).errors, []);
});

test("genuine unresolved report placeholders remain rejected", () => {
  for (const placeholder of ["TODO", "placeholder", "<candidate-sha>", "unknown"]) {
    const result = validateReportText(`${task195Report}\n${placeholder}\n`);
    assert.ok(result.errors.includes("report contains a placeholder or unresolved value"));
  }
});
