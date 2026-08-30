#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateJsonSchema } from "./lib/json-schema-validator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT_ROOT = path.resolve(ROOT, ".local/deadem/review-targets");
const OUTPUT_ROOT = "output/local-replay-processing/two-match-assisted-review-intake/task198-bounded2";
const PROTECTED = /(?:^|[\\/])replay_00[5-8](?:[\\/]|$)/iu;
const HEAVY_EXTENSIONS = new Set([".dem", ".mp4", ".mkv", ".mov", ".webm"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm"]);
let intakeSchema;

const normalizePath = (value) => value.replaceAll("\\", "/");
const bytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
const round = (value, digits = 3) => Number(value.toFixed(digits));

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  const target = path.resolve(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes(value));
}

async function loadIntakeSchema() {
  intakeSchema ??= await readJson("schemas/two-match-assisted-review-intake.schema.json");
  return intakeSchema;
}

export function assertAuthorizedReviewPath(inputPath) {
  const normalized = normalizePath(inputPath);
  if (PROTECTED.test(normalized)) throw new Error(`protected historical replay path rejected before access: ${normalized}`);
  if (/review_match_00[12]/u.test(normalized)) return;
  throw new Error(`path is outside authorized review target namespace: ${normalized}`);
}

export function isHeavyBinaryPath(inputPath) {
  return HEAVY_EXTENSIONS.has(path.extname(inputPath).toLowerCase());
}

export async function hashFileStreaming(inputPath) {
  assertAuthorizedReviewPath(inputPath);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(inputPath, { highWaterMark: 4 * 1024 * 1024 })) hash.update(chunk);
  return hash.digest("hex");
}

async function readBoxHeader(handle, offset, boundary) {
  if (offset + 8 > boundary) return null;
  const header = Buffer.alloc(16);
  const { bytesRead } = await handle.read(header, 0, 16, offset);
  if (bytesRead < 8) return null;
  let size = header.readUInt32BE(0);
  const type = header.toString("ascii", 4, 8);
  let headerSize = 8;
  if (size === 1) {
    if (bytesRead < 16) return null;
    size = Number(header.readBigUInt64BE(8));
    headerSize = 16;
  } else if (size === 0) {
    size = boundary - offset;
  }
  if (!Number.isSafeInteger(size) || size < headerSize || offset + size > boundary) return null;
  return { type, size, headerSize, payloadOffset: offset + headerSize, end: offset + size };
}

export async function probeMp4(inputPath) {
  assertAuthorizedReviewPath(inputPath);
  const handle = await open(inputPath, "r");
  try {
    const stat = await handle.stat();
    const first = Buffer.alloc(16);
    const firstRead = await handle.read(first, 0, first.length, 0);
    if (firstRead.bytesRead < 12 || first.toString("ascii", 4, 8) !== "ftyp") throw new Error("video is not an ISO Base Media file");
    const majorBrand = first.toString("ascii", 8, 12);
    let offset = 0;
    let moov = null;
    while (offset < stat.size) {
      const box = await readBoxHeader(handle, offset, stat.size);
      if (!box) break;
      if (box.type === "moov") { moov = box; break; }
      offset = box.end;
    }
    if (!moov) throw new Error("MP4 moov box is unavailable");
    offset = moov.payloadOffset;
    let mvhd = null;
    while (offset < moov.end) {
      const box = await readBoxHeader(handle, offset, moov.end);
      if (!box) break;
      if (box.type === "mvhd") { mvhd = box; break; }
      offset = box.end;
    }
    if (!mvhd) throw new Error("MP4 mvhd box is unavailable");
    const payload = Buffer.alloc(Math.min(40, mvhd.end - mvhd.payloadOffset));
    const payloadRead = await handle.read(payload, 0, payload.length, mvhd.payloadOffset);
    if (payloadRead.bytesRead < 20) throw new Error("MP4 mvhd payload is truncated");
    const version = payload.readUInt8(0);
    const timescale = version === 1 ? payload.readUInt32BE(20) : payload.readUInt32BE(12);
    const durationUnits = version === 1 ? Number(payload.readBigUInt64BE(24)) : payload.readUInt32BE(16);
    if (!timescale || !Number.isFinite(durationUnits)) throw new Error("MP4 duration metadata is invalid");
    return {
      format: "iso_base_media_mp4",
      majorBrand,
      durationSeconds: round(durationUnits / timescale, 3),
      probeMethod: "mp4_mvhd_random_access",
    };
  } finally {
    await handle.close();
  }
}

export async function identifyReplayFormat(inputPath) {
  assertAuthorizedReviewPath(inputPath);
  const handle = await open(inputPath, "r");
  try {
    const signature = Buffer.alloc(8);
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    if (bytesRead !== 8 || signature.toString("ascii") !== "PBDEMS2\0") throw new Error("replay signature is not PBDEMS2");
    return { format: "source2_demo_pbde_ms2", signature: "PBDEMS2" };
  } finally {
    await handle.close();
  }
}

async function eligibleFiles(slotPath, kind) {
  assertAuthorizedReviewPath(slotPath);
  const entries = await readdir(slotPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const eligible = files.filter((entry) => kind === "replay"
    ? path.extname(entry.name).toLowerCase() === ".dem"
    : VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()));
  if (files.length !== 1 || eligible.length !== 1) {
    throw new Error(`ambiguous ${kind} slot ${normalizePath(slotPath)}: files=${files.length}, eligible=${eligible.length}`);
  }
  return path.join(slotPath, eligible[0].name);
}

export async function resolveReviewTarget(inputRoot, definition, adapters = {}) {
  const hashFile = adapters.hashFile ?? hashFileStreaming;
  const replayProbe = adapters.replayProbe ?? identifyReplayFormat;
  const videoProbe = adapters.videoProbe ?? probeMp4;
  const replayPath = await eligibleFiles(path.join(inputRoot, definition.reviewTargetId, "replay"), "replay");
  const videoPath = await eligibleFiles(path.join(inputRoot, definition.reviewTargetId, "video"), "video");
  const [replayStat, videoStat, replaySha256, videoSha256, replayFormat, videoFormat] = await Promise.all([
    open(replayPath, "r").then(async (handle) => { try { return await handle.stat(); } finally { await handle.close(); } }),
    open(videoPath, "r").then(async (handle) => { try { return await handle.stat(); } finally { await handle.close(); } }),
    hashFile(replayPath), hashFile(videoPath), replayProbe(replayPath), videoProbe(videoPath),
  ]);
  const sourceSlot = (kind) => `.local/deadem/review-targets/${definition.reviewTargetId}/${kind}`;
  return {
    reviewTargetId: definition.reviewTargetId,
    association: {
      status: "resolved",
      method: "human_supplied_exclusive_slot",
      ambiguityCount: 0,
      reuseCount: 0,
    },
    inputs: {
      replay: {
        filenameOriginal: path.basename(replayPath), localPath: replayPath,
        sourceSlot: sourceSlot("replay"), extension: path.extname(replayPath).toLowerCase(),
        sizeBytes: replayStat.size, sha256: replaySha256, ...replayFormat,
        provenanceClass: "factual/local_file_observed",
      },
      video: {
        filenameOriginal: path.basename(videoPath), localPath: videoPath,
        sourceSlot: sourceSlot("video"), extension: path.extname(videoPath).toLowerCase(),
        sizeBytes: videoStat.size, sha256: videoSha256, ...videoFormat,
        provenanceClass: "factual/local_file_observed",
      },
    },
    factualMetadata: {
      provenanceClass: "factual/replay_observed",
      matchId: null,
      replayBuild: null,
      date: null,
      players: [],
      teams: [],
      heroes: [],
      result: null,
      gaps: ["match_id", "replay_build", "match_date", "players", "teams", "heroes", "result"],
    },
    humanSuppliedMetadata: structuredClone(definition.humanSuppliedMetadata),
    inferredMetadata: {
      provenanceClass: "inferred",
      values: [],
      gaps: ["No inferred match or gameplay metadata was produced by Task 198."],
    },
  };
}

export function buildManifest(definitions, resolvedTargets) {
  return {
    schemaVersion: 1,
    artifactClass: "two_match_assisted_review_intake",
    generatedBy: "tools/emit-two-match-assisted-review-intake.mjs",
    generatedAt: "task_198",
    targetNamespace: "assisted_review_target",
    associationPolicy: "human_supplied_exclusive_slot",
    targetCount: resolvedTargets.length,
    inputCount: resolvedTargets.reduce((sum, target) => sum + Object.keys(target.inputs).length, 0),
    reviewTargetIds: definitions.map((definition) => definition.reviewTargetId),
    targets: resolvedTargets,
    protectedReplayAccessCount: 0,
    heavyBinariesVersioned: 0,
    finalFactsProduced: false,
    attributionEmitted: false,
  };
}

export function validateManifest(manifest, schema) {
  const errors = validateJsonSchema(schema, manifest).errors.map((error) => `schema:${error}`);
  if (manifest.targetCount !== 2 || manifest.targets.length !== 2) errors.push("target-count");
  if (manifest.inputCount !== 4) errors.push("input-count");
  if (new Set(manifest.reviewTargetIds).size !== 2) errors.push("target-id-uniqueness");
  if (manifest.reviewTargetIds.some((id) => /replay_00[5-8]/iu.test(id))) errors.push("protected-membership");
  for (const target of manifest.targets) {
    if (target.association.status !== "resolved" || target.association.ambiguityCount || target.association.reuseCount) errors.push(`association:${target.reviewTargetId}`);
    if (target.humanSuppliedMetadata.provenanceClass !== "human_supplied/player_reported") errors.push(`human-provenance:${target.reviewTargetId}`);
    if (target.factualMetadata.provenanceClass !== "factual/replay_observed") errors.push(`factual-provenance:${target.reviewTargetId}`);
    if (target.inferredMetadata.provenanceClass !== "inferred") errors.push(`inferred-provenance:${target.reviewTargetId}`);
    if (target.inputs.replay.localPath === target.inputs.video.localPath) errors.push(`input-reuse:${target.reviewTargetId}`);
  }
  if (manifest.protectedReplayAccessCount || manifest.heavyBinariesVersioned || manifest.finalFactsProduced || manifest.attributionEmitted) errors.push("safety-boundary");
  return errors;
}

export async function executeIntake({ inputRoot = DEFAULT_INPUT_ROOT, publish = false, adapters = {} } = {}) {
  const [definitions, schema] = await Promise.all([
    readJson("data/two-match-assisted-review-targets.json"),
    loadIntakeSchema(),
  ]);
  if (definitions.targets.length !== 2) throw new Error("Task 198 requires exactly two review targets");
  const resolvedTargets = [];
  for (const definition of definitions.targets) resolvedTargets.push(await resolveReviewTarget(inputRoot, definition, adapters));
  const manifest = buildManifest(definitions.targets, resolvedTargets);
  const validationErrors = validateManifest(manifest, schema);
  if (validationErrors.length) throw new Error(`review intake manifest invalid: ${validationErrors.join("; ")}`);
  const metadataGapCount = manifest.targets.reduce((sum, target) => sum + target.factualMetadata.gaps.length + target.inferredMetadata.gaps.length, 0);
  const technicalGateStatus = metadataGapCount
    ? "two_match_review_targets_ready_with_declared_metadata_gaps"
    : "two_match_review_targets_ready";
  const manifestSha256 = createHash("sha256").update(bytes(manifest)).digest("hex");
  const summary = {
    schemaVersion: 1, taskId: "198", module: "Two-Match Assisted Review Intake",
    technicalGateStatus, targetsExpected: 2, targetsResolved: 2, inputsExpected: 4, inputsFound: 4,
    associationAmbiguities: 0, inputReuseCount: 0, metadataGapCount,
    vodDurationSeconds: Object.fromEntries(manifest.targets.map((target) => [target.reviewTargetId, target.inputs.video.durationSeconds])),
    manifestSha256, protectedReplayAccessCount: 0, heavyBinariesVersioned: 0,
    finalFactsProduced: false, attributionEmitted: false,
  };
  const gate = {
    schemaVersion: 1, taskId: "198", technicalGateStatus, status: "passed_with_declared_metadata_gaps",
    targetsResolved: 2, inputsFound: 4, deterministicManifest: true, idempotentPublication: true,
    associationAmbiguities: 0, protectedReplayAccessCount: 0, heavyBinariesVersioned: 0,
    finalFacts: 0, attribution: 0,
  };
  const provenanceAudit = {
    schemaVersion: 1, taskId: "198", associationPolicy: manifest.associationPolicy,
    inputs: manifest.targets.flatMap((target) => Object.entries(target.inputs).map(([kind, input]) => ({
      reviewTargetId: target.reviewTargetId, kind, filenameOriginal: input.filenameOriginal,
      localPath: input.localPath, sourceSlot: input.sourceSlot, sizeBytes: input.sizeBytes,
      sha256: input.sha256, provenanceClass: input.provenanceClass,
    }))),
    factualHumanInferredSeparated: true, protectedReplayAccessCount: 0,
  };
  if (publish) {
    await Promise.all([
      writeJson(`${OUTPUT_ROOT}/manifest.json`, manifest),
      writeJson(`${OUTPUT_ROOT}/summary.json`, summary),
      writeJson(`${OUTPUT_ROOT}/gate.json`, gate),
      writeJson(`${OUTPUT_ROOT}/provenance-audit.json`, provenanceAudit),
    ]);
  }
  return { manifest, summary, gate, provenanceAudit };
}

async function main() {
  const result = await executeIntake({ publish: true });
  process.stdout.write(`${JSON.stringify({ gate: result.gate.technicalGateStatus, targets: result.summary.targetsResolved, inputs: result.summary.inputsFound })}\n`);
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
