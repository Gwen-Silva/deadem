import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildManifest, validateManifest } from "../tools/emit-two-match-assisted-review-intake.mjs";

const schema = JSON.parse(await readFile(new URL("../schemas/two-match-assisted-review-intake.schema.json", import.meta.url)));

function input(kind, id) {
  const common = {
    filenameOriginal: kind === "replay" ? "match.dem" : "match.mp4",
    localPath: `C:/review-targets/${id}/${kind}/match.${kind === "replay" ? "dem" : "mp4"}`,
    sourceSlot: `.local/deadem/review-targets/${id}/${kind}`,
    extension: kind === "replay" ? ".dem" : ".mp4", sizeBytes: 10,
    sha256: "a".repeat(64), provenanceClass: "factual/local_file_observed",
  };
  return kind === "replay"
    ? { ...common, format: "source2_demo_pbde_ms2", signature: "PBDEMS2" }
    : { ...common, format: "iso_base_media_mp4", majorBrand: "iso4", durationSeconds: 12.345, probeMethod: "mp4_mvhd_random_access" };
}

function target(id, label) {
  return {
    reviewTargetId: id,
    association: { status: "resolved", method: "human_supplied_exclusive_slot", ambiguityCount: 0, reuseCount: 0 },
    inputs: { replay: input("replay", id), video: input("video", id) },
    factualMetadata: { provenanceClass: "factual/replay_observed", matchId: null, replayBuild: null, date: null, players: [], teams: [], heroes: [], result: null, gaps: ["match_id"] },
    humanSuppliedMetadata: { provenanceClass: "human_supplied/player_reported", label, roster: ["1", "2", "3", "4", "5", "6"], context: ["reported"] },
    inferredMetadata: { provenanceClass: "inferred", values: [], gaps: ["none inferred"] },
  };
}

function validManifest() {
  const definitions = [{ reviewTargetId: "review_match_001" }, { reviewTargetId: "review_match_002" }];
  return buildManifest(definitions, [target("review_match_001", "Archmother"), target("review_match_002", "Hidden King")]);
}

test("two-match intake artifact passes strict schema and semantic validation", () => {
  assert.deepEqual(validateManifest(validManifest(), schema), []);
});

test("schema and provenance boundaries fail closed", () => {
  for (const mutate of [
    (value) => { value.targetCount = 1; },
    (value) => { value.inputCount = 3; },
    (value) => { value.reviewTargetIds[1] = "review_match_001"; },
    (value) => { value.targets[0].association.ambiguityCount = 1; },
    (value) => { value.targets[0].humanSuppliedMetadata.provenanceClass = "factual/replay_observed"; },
    (value) => { value.targets[0].inferredMetadata.values.push("death confirmed"); },
    (value) => { value.protectedReplayAccessCount = 1; },
    (value) => { value.heavyBinariesVersioned = 1; },
    (value) => { value.finalFactsProduced = true; },
  ]) {
    const changed = validManifest();
    mutate(changed);
    assert.ok(validateManifest(changed, schema).length > 0);
  }
});
