import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertAuthorizedReviewPath, buildManifest, executeIntake, hashFileStreaming,
  identifyReplayFormat, isHeavyBinaryPath, probeMp4, resolveReviewTarget,
} from "../tools/emit-two-match-assisted-review-intake.mjs";

const human = (label) => ({
  provenanceClass: "human_supplied/player_reported", label,
  roster: ["one", "two", "three", "four", "five", "six"],
  context: ["player reported context"],
});

function box(type, payload) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 4, "ascii");
  payload.copy(result, 8);
  return result;
}

function mp4Fixture(durationSeconds = 12.345) {
  const ftyp = Buffer.alloc(16);
  ftyp.write("iso4", 0, 4, "ascii");
  ftyp.writeUInt32BE(512, 4);
  ftyp.write("iso4", 8, 4, "ascii");
  ftyp.write("mp41", 12, 4, "ascii");
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt8(0, 0);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(Math.round(durationSeconds * 1000), 16);
  return Buffer.concat([box("ftyp", ftyp), box("moov", box("mvhd", mvhd))]);
}

async function makeTarget(root, id, { extraReplay = false } = {}) {
  const replay = path.join(root, id, "replay");
  const video = path.join(root, id, "video");
  await Promise.all([mkdir(replay, { recursive: true }), mkdir(video, { recursive: true })]);
  await writeFile(path.join(replay, `${id}.dem`), Buffer.concat([Buffer.from("PBDEMS2\0"), Buffer.alloc(16)]));
  await writeFile(path.join(video, `${id}.mp4`), mp4Fixture());
  if (extraReplay) await writeFile(path.join(replay, "extra.dem"), Buffer.from("PBDEMS2\0"));
}

test("bounded probes identify Source 2 demos and MP4 duration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task198-probes-"));
  await makeTarget(root, "review_match_001");
  const replay = path.join(root, "review_match_001/replay/review_match_001.dem");
  const video = path.join(root, "review_match_001/video/review_match_001.mp4");
  assert.deepEqual(await identifyReplayFormat(replay), { format: "source2_demo_pbde_ms2", signature: "PBDEMS2" });
  assert.deepEqual(await probeMp4(video), { format: "iso_base_media_mp4", majorBrand: "iso4", durationSeconds: 12.345, probeMethod: "mp4_mvhd_random_access" });
  assert.match(await hashFileStreaming(replay), /^[0-9a-f]{64}$/u);
});

test("target resolution preserves exclusive association and provenance separation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task198-target-"));
  await makeTarget(root, "review_match_001");
  const target = await resolveReviewTarget(root, { reviewTargetId: "review_match_001", humanSuppliedMetadata: human("Archmother") });
  assert.equal(target.association.status, "resolved");
  assert.notEqual(target.inputs.replay.localPath, target.inputs.video.localPath);
  assert.equal(target.factualMetadata.provenanceClass, "factual/replay_observed");
  assert.equal(target.humanSuppliedMetadata.provenanceClass, "human_supplied/player_reported");
  assert.equal(target.inferredMetadata.provenanceClass, "inferred");
  assert.equal(target.factualMetadata.matchId, null);
});

test("manifest is deterministic with exactly two unique targets and four inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task198-manifest-"));
  await Promise.all([makeTarget(root, "review_match_001"), makeTarget(root, "review_match_002")]);
  const definitions = [
    { reviewTargetId: "review_match_001", humanSuppliedMetadata: human("Archmother") },
    { reviewTargetId: "review_match_002", humanSuppliedMetadata: human("Hidden King") },
  ];
  const targets = [];
  for (const definition of definitions) targets.push(await resolveReviewTarget(root, definition));
  const first = buildManifest(definitions, targets);
  const second = buildManifest(definitions, structuredClone(targets));
  assert.equal(first.targetCount, 2);
  assert.equal(first.inputCount, 4);
  assert.equal(new Set(first.reviewTargetIds).size, 2);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("missing-file behavior fails closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task198-missing-"));
  await mkdir(path.join(root, "review_match_001/replay"), { recursive: true });
  await mkdir(path.join(root, "review_match_001/video"), { recursive: true });
  await assert.rejects(() => resolveReviewTarget(root, { reviewTargetId: "review_match_001", humanSuppliedMetadata: human("x") }), /ambiguous replay slot/u);
});

test("ambiguous association behavior fails closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task198-ambiguous-"));
  await makeTarget(root, "review_match_001", { extraReplay: true });
  await assert.rejects(() => resolveReviewTarget(root, { reviewTargetId: "review_match_001", humanSuppliedMetadata: human("x") }), /files=2, eligible=2/u);
});

test("protected historical replay aliases fail before access", () => {
  for (const id of ["005", "006", "007", "008"]) {
    assert.throws(() => assertAuthorizedReviewPath(`C:/safe/replay_${id}/input.dem`), /protected historical replay path rejected before access/u);
  }
  assert.doesNotThrow(() => assertAuthorizedReviewPath("C:/safe/review_match_001/replay/input.dem"));
});

test("heavy binary extensions are classified and no local review binary is tracked", () => {
  for (const extension of ["dem", "mp4", "mkv", "mov", "webm"]) assert.equal(isHeavyBinaryPath(`file.${extension}`), true);
  const tracked = execFileSync("git", ["ls-files", ".local/deadem/review-targets"], { encoding: "utf8" }).trim();
  assert.equal(tracked, "");
});

test("real execution is idempotent and publishes no heavy binary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "task198-idempotent-"));
  await Promise.all([makeTarget(root, "review_match_001"), makeTarget(root, "review_match_002")]);
  const first = await executeIntake({ inputRoot: root });
  const second = await executeIntake({ inputRoot: root });
  assert.equal(JSON.stringify(first.manifest), JSON.stringify(second.manifest));
  assert.equal(first.manifest.heavyBinariesVersioned, 0);
  assert.equal(first.gate.technicalGateStatus, "two_match_review_targets_ready_with_declared_metadata_gaps");
});

test("human definitions remain exact JSON and inferred values remain empty", async () => {
  const definitions = JSON.parse(await readFile(new URL("../data/two-match-assisted-review-targets.json", import.meta.url), "utf8"));
  assert.deepEqual(definitions.targets[0].humanSuppliedMetadata.roster, ["Wraith", "Lady Geist", "Bebop", "Mo & Krill", "Rem", "Shiv"]);
  assert.deepEqual(definitions.targets[1].humanSuppliedMetadata.roster, ["Lash", "Shiv", "Venator", "Paige", "Graves", "Mo & Krill"]);
});
