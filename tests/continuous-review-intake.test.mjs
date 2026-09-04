import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  IntakeError,
  assertContinuousReviewTargetId,
  assertSafeSourceText,
  buildManifest,
  naturalFilenameCompare,
  safeCliSummary,
} from "../tools/continuous-review/intake-model.mjs";
import {
  assertRealDirectory,
  assertRegularFile,
  hashFileStreaming,
  inspectSourceBundle,
  probeMp4,
  resolveCraig,
  validateReplayHeader,
} from "../tools/continuous-review/intake-paths.mjs";
import {
  assertRegistryEntryName,
  executeIntake,
  parseArguments,
  registrationDecision,
  validateManifest,
} from "../tools/continuous-review/intake.mjs";
import { createSyntheticBundle, syntheticMp4, syntheticReplay } from "../tools/continuous-review/canary.mjs";

async function temporary(t, label = "task218-") {
  const directory = await mkdtemp(path.join(os.tmpdir(), label));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function exists(file) {
  try { await stat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

test("continuous target namespace accepts 009-999 and rejects legacy, protected and malformed ids", () => {
  for (const id of ["009", "010", "042", "999"]) assert.equal(assertContinuousReviewTargetId(`review_match_${id}`), `review_match_${id}`);
  for (const id of ["001", "002", "003", "004"]) assert.throws(() => assertContinuousReviewTargetId(`review_match_${id}`), { code: "legacy_target_id" });
  for (const id of ["005", "006", "007", "008"]) assert.throws(() => assertContinuousReviewTargetId(`review_match_${id}`), { code: "protected_target_id" });
  for (const id of ["review_match_000", "review_match_1000", "review_match_x", "replay_009"]) assert.throws(() => assertContinuousReviewTargetId(id));
});

test("protected aliases reject before any filesystem access", async () => {
  for (const id of ["005", "006", "007", "008"]) {
    await assert.rejects(executeIntake({ source: "Z:/definitely-missing", target: `review_match_${id}`, mode: "dry-run" }), { code: "protected_target_id" });
    await assert.rejects(inspectSourceBundle(`Z:/definitely-missing/replay_${id}`), { code: "protected_target_id" });
  }
});

test("Craig protected entry aliases reject immediately after readdir with zero protected-path operations", async () => {
  const cases = [
    "replay_005.aac",
    "replay_006.aac",
    "replay_007.aac",
    "replay_008.aac",
    "review_match_005.aac",
    "match_006.aac",
  ];
  for (const name of cases) {
    const counts = { protectedLstat: 0, protectedRealpath: 0, protectedHashOpenRead: 0 };
    const isProtected = (value) => String(value).includes(name);
    const io = {
      async lstat(value) {
        if (isProtected(value)) counts.protectedLstat += 1;
        return { isDirectory: () => true, isSymbolicLink: () => false };
      },
      async realpath(value) {
        if (isProtected(value)) counts.protectedRealpath += 1;
        return path.resolve(value);
      },
      async readdir() {
        return [{ name, isFile: () => true, isSymbolicLink: () => false }];
      },
    };
    const hashFile = async (value) => {
      if (isProtected(value)) counts.protectedHashOpenRead += 1;
      return "0".repeat(64);
    };
    await assert.rejects(resolveCraig(path.resolve("synthetic-source"), io, { hashFile }), { code: "protected_target_id" });
    assert.deepEqual(counts, { protectedLstat: 0, protectedRealpath: 0, protectedHashOpenRead: 0 });
  }
});

test("registry protected aliases reject before any protected manifest read", async () => {
  const manifest = { reviewTargetId: "review_match_009", intakeFingerprint: "a", coreInputFingerprint: "b" };
  for (const id of ["005", "006", "007", "008"]) {
    let manifestReads = 0;
    const entryName = `review_match_${id}`;
    await assert.rejects(registrationDecision(manifest, path.resolve("synthetic-registry"), {
      readRegistryEntries: async () => [{ name: entryName, isDirectory: () => true }],
      readRegistryManifest: async () => { manifestReads += 1; return null; },
    }), { code: "protected_target_id" });
    assert.equal(manifestReads, 0);
  }
});

test("registry legacy and malformed entries fail closed before any manifest read", async () => {
  const manifest = { reviewTargetId: "review_match_009", intakeFingerprint: "a", coreInputFingerprint: "b" };
  for (const entryName of ["foo", "review_match_001", "review_match_1000"]) {
    let manifestReads = 0;
    await assert.rejects(registrationDecision(manifest, path.resolve("synthetic-registry"), {
      readRegistryEntries: async () => [{ name: entryName, isDirectory: () => true }],
      readRegistryManifest: async () => { manifestReads += 1; return null; },
    }), { code: "invalid_registry_entry" });
    assert.equal(manifestReads, 0);
  }
});

test("registry namespace guard preserves valid review_match_009 through review_match_999", () => {
  for (const name of ["review_match_009", "review_match_010", "review_match_999"]) {
    assert.equal(assertRegistryEntryName(name), name);
  }
});

test("source text rejects traversal and null bytes before resolution", () => {
  assert.throws(() => assertSafeSourceText("safe/../outside"), { code: "invalid_source_path" });
  assert.throws(() => assertSafeSourceText("safe\0outside"), { code: "invalid_source_path" });
});

test("source, replay and video directory/file guards reject symlink-shaped stats", () => {
  const directorySymlink = { isDirectory: () => true, isSymbolicLink: () => true };
  const fileSymlink = { isFile: () => true, isSymbolicLink: () => true };
  for (const label of ["source", "replay/", "video/"]) assert.throws(() => assertRealDirectory(directorySymlink, label), { code: "unsafe_input_path" });
  for (const label of ["replay .dem", "video .mp4", "craig .aac"]) assert.throws(() => assertRegularFile(fileSymlink, label), { code: "unsafe_input_path" });
});

test("required slots demand exactly one DEM and one MP4", async (t) => {
  const zeroReplay = await temporary(t, "task218-zero-replay-");
  await createSyntheticBundle(zeroReplay);
  await rm(path.join(zeroReplay, "replay/input.dem"));
  await assert.rejects(inspectSourceBundle(zeroReplay), /exatamente um replay/u);

  const multipleReplay = await temporary(t, "task218-multi-replay-");
  await createSyntheticBundle(multipleReplay);
  await writeFile(path.join(multipleReplay, "replay/other.dem"), syntheticReplay(2));
  await assert.rejects(inspectSourceBundle(multipleReplay), /exatamente um replay/u);

  const zeroVideo = await temporary(t, "task218-zero-video-");
  await createSyntheticBundle(zeroVideo);
  await rm(path.join(zeroVideo, "video/input.mp4"));
  await assert.rejects(inspectSourceBundle(zeroVideo), /exatamente um MP4/u);

  const multipleVideo = await temporary(t, "task218-multi-video-");
  await createSyntheticBundle(multipleVideo);
  await writeFile(path.join(multipleVideo, "video/other.mp4"), syntheticMp4());
  await assert.rejects(inspectSourceBundle(multipleVideo), /exatamente um MP4/u);
});

test("unexpected files in required slots fail closed", async (t) => {
  const root = await temporary(t, "task218-unexpected-");
  await createSyntheticBundle(root);
  await writeFile(path.join(root, "replay/readme.txt"), "not allowed");
  await assert.rejects(inspectSourceBundle(root), /exatamente um replay/u);
});

test("replay probe validates PBDEMS2, minimum header, summary offset and streaming hash", async (t) => {
  const valid = syntheticReplay(7);
  assert.equal(validateReplayHeader(valid.subarray(0, 16), valid.length).summaryOffset, 32);
  assert.throws(() => validateReplayHeader(Buffer.alloc(8), 64), /assinatura/u);
  const badSignature = Buffer.from(valid); badSignature[0] = 0;
  assert.throws(() => validateReplayHeader(badSignature, badSignature.length), /assinatura/u);
  const badOffset = Buffer.from(valid); badOffset.writeUInt32LE(1000, 8);
  assert.throws(() => validateReplayHeader(badOffset, badOffset.length), /summary offset/u);
  const root = await temporary(t, "task218-hash-");
  const file = path.join(root, "synthetic.bin");
  await writeFile(file, valid);
  assert.equal(await hashFileStreaming(file), createHash("sha256").update(valid).digest("hex"));
});

test("MP4 probe validates ISO Base Media, moov and positive duration", async (t) => {
  const root = await temporary(t, "task218-mp4-");
  const file = path.join(root, "valid.bin");
  const valid = syntheticMp4(14.5);
  await writeFile(file, valid);
  assert.equal((await probeMp4(file, valid.length)).durationSeconds, 14.5);
  const invalidContainer = Buffer.from(valid); invalidContainer.write("nope", 4, 4, "ascii");
  await writeFile(file, invalidContainer);
  await assert.rejects(probeMp4(file, invalidContainer.length), /ftyp/u);
  const noMoov = valid.subarray(0, 24);
  await writeFile(file, noMoov);
  await assert.rejects(probeMp4(file, noMoov.length), /moov/u);
  const zero = syntheticMp4(0);
  await writeFile(file, zero);
  await assert.rejects(probeMp4(file, zero.length), /maior que zero/u);
});

test("Craig is optional and an existing empty Craig folder is a declared gap", async (t) => {
  const absent = await temporary(t, "task218-craig-absent-");
  await createSyntheticBundle(absent);
  assert.equal((await inspectSourceBundle(absent)).communication.status, "not_supplied");
  const empty = await temporary(t, "task218-craig-empty-");
  await createSyntheticBundle(empty, { craigDirectory: true });
  const inspected = await inspectSourceBundle(empty);
  assert.equal(inspected.communication.status, "supplied_with_gap");
  assert.equal(inspected.communication.trackCount, 0);
});

test("Craig accepts one, nine and arbitrary positive track counts without decoding", async (t) => {
  for (const count of [1, 3, 9]) {
    const root = await temporary(t, `task218-craig-${count}-`);
    await createSyntheticBundle(root, { tracks: count, craigDirectory: true });
    const communication = (await inspectSourceBundle(root)).communication;
    assert.equal(communication.status, "supplied_unprocessed");
    assert.equal(communication.trackCount, count);
  }
});

test("Craig ordering is deterministic and support files are detected without content promotion", async (t) => {
  const root = await temporary(t, "task218-craig-order-");
  await createSyntheticBundle(root, { tracks: 0, craigDirectory: true });
  await Promise.all([
    writeFile(path.join(root, "craig/speaker-10.aac"), "ten"),
    writeFile(path.join(root, "craig/speaker-2.aac"), "two"),
    writeFile(path.join(root, "craig/speaker-1.aac"), "one"),
    writeFile(path.join(root, "craig/info.txt"), "private"),
    writeFile(path.join(root, "craig/raw.dat"), "private"),
  ]);
  const communication = (await inspectSourceBundle(root)).communication;
  assert.deepEqual(communication.tracks.map((track) => track.index), [1, 2, 3]);
  assert.deepEqual(communication.tracks.map((track) => track.localIdentifier), ["track_001", "track_002", "track_003"]);
  assert.deepEqual(communication.supportFiles, { infoTxt: true, rawDat: true });
  assert.ok(naturalFilenameCompare("speaker-2.aac", "speaker-10.aac") < 0);
});

test("Craig rejects nested directories and symlink-like entries", async (t) => {
  const root = await temporary(t, "task218-craig-unsafe-");
  await createSyntheticBundle(root, { craigDirectory: true });
  await mkdir(path.join(root, "craig/nested"));
  await assert.rejects(inspectSourceBundle(root), { code: "unsafe_input_path" });
});

test("dry-run builds a schema-valid deterministic manifest and writes nothing", async (t) => {
  const root = await temporary(t, "task218-dry-");
  const registryRoot = path.join(root, "registry");
  const source = path.join(root, "source");
  await createSyntheticBundle(source, { tracks: 1, craigDirectory: true });
  const first = await executeIntake({ source, target: "review_match_009", mode: "dry-run", registryRoot });
  const second = await executeIntake({ source, target: "review_match_009", mode: "dry-run", registryRoot });
  assert.equal(first.outcome, "validated_dry_run");
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(validateManifest(first.manifest).valid, true);
  assert.equal(await exists(path.join(registryRoot, "review_match_009/manifest.json")), false);
});

test("manifest validation rejects inconsistent Craig counts and fingerprints", async (t) => {
  const root = await temporary(t, "task218-invalid-manifest-");
  await createSyntheticBundle(root, { tracks: 1, craigDirectory: true });
  const result = await executeIntake({ source: root, target: "review_match_009", mode: "dry-run", registryRoot: path.join(root, "registry") });
  const badCount = structuredClone(result.manifest);
  badCount.inputs.communication.trackCount = 2;
  assert.throws(() => validateManifest(badCount), { code: "invalid_manifest" });
  const badFingerprint = structuredClone(result.manifest);
  badFingerprint.intakeFingerprint = "0".repeat(64);
  assert.throws(() => validateManifest(badFingerprint), { code: "invalid_manifest" });
});

test("register publishes atomically and repeats as already_registered_same_inputs", async (t) => {
  const root = await temporary(t, "task218-register-");
  const registryRoot = path.join(root, "registry");
  const source = path.join(root, "source");
  await createSyntheticBundle(source);
  const first = await executeIntake({ source, target: "review_match_009", mode: "register", registryRoot });
  const second = await executeIntake({ source, target: "review_match_009", mode: "register", registryRoot });
  assert.equal(first.outcome, "registered");
  assert.equal(second.outcome, "already_registered_same_inputs");
  const targetDirectory = path.join(registryRoot, "review_match_009");
  assert.deepEqual(await readdir(targetDirectory), ["manifest.json"]);
  assert.equal(validateManifest(JSON.parse(await readFile(path.join(targetDirectory, "manifest.json"), "utf8"))).valid, true);
});

test("same target with changed inputs fails as target_input_identity_conflict", async (t) => {
  const root = await temporary(t, "task218-conflict-");
  const registryRoot = path.join(root, "registry");
  const source = path.join(root, "source");
  await createSyntheticBundle(source, { marker: 1 });
  await executeIntake({ source, target: "review_match_009", mode: "register", registryRoot });
  await writeFile(path.join(source, "replay/input.dem"), syntheticReplay(2));
  await assert.rejects(executeIntake({ source, target: "review_match_009", mode: "register", registryRoot }), { code: "target_input_identity_conflict" });
});

test("same replay+video under another target fails as input_bundle_already_registered", async (t) => {
  const root = await temporary(t, "task218-duplicate-");
  const registryRoot = path.join(root, "registry");
  const source = path.join(root, "source");
  await createSyntheticBundle(source);
  await executeIntake({ source, target: "review_match_009", mode: "register", registryRoot });
  await assert.rejects(executeIntake({ source, target: "review_match_010", mode: "register", registryRoot }), { code: "input_bundle_already_registered" });
});

test("manifest fingerprints depend on target, core inputs and ordered communication hashes", async (t) => {
  const root = await temporary(t, "task218-fingerprint-");
  await createSyntheticBundle(root, { tracks: 3, craigDirectory: true });
  const inspected = await inspectSourceBundle(root);
  const a = buildManifest({ reviewTargetId: "review_match_009", ...inspected });
  const b = buildManifest({ reviewTargetId: "review_match_009", ...structuredClone(inspected) });
  const c = buildManifest({ reviewTargetId: "review_match_010", ...structuredClone(inspected) });
  assert.equal(a.intakeFingerprint, b.intakeFingerprint);
  assert.equal(a.coreInputFingerprint, c.coreInputFingerprint);
  assert.notEqual(a.intakeFingerprint, c.intakeFingerprint);
});

test("safe CLI output omits absolute paths, hashes and private filenames", async (t) => {
  const root = await temporary(t, "task218-safe-output-");
  await createSyntheticBundle(root, { tracks: 1, craigDirectory: true });
  const result = await executeIntake({ source: root, target: "review_match_009", mode: "dry-run", registryRoot: path.join(root, "registry") });
  const output = safeCliSummary(result);
  assert.doesNotMatch(output, /[A-Za-z]:[\\/]|task218-safe-output|speaker-1|[0-9a-f]{64}/iu);
  assert.match(output, /READY_FOR_FACTUAL_PROCESSING/u);
});

test("CLI parser requires exactly one explicit mode and help documents safety boundaries", () => {
  assert.equal(parseArguments(["--help"]).help, true);
  assert.throws(() => parseArguments(["--source", "x", "--target", "review_match_009"]), { code: "invalid_mode" });
  assert.throws(() => parseArguments(["--source", "x", "--target", "review_match_009", "--dry-run", "--register"]), { code: "invalid_mode" });
  const output = execFileSync(process.execPath, ["tools/continuous-review/intake.mjs", "--help"], { cwd: path.resolve("."), encoding: "utf8" });
  assert.match(output, /005–008 são reservados/u);
  assert.match(output, /não analisa gameplay/u);
  const rejected = spawnSync(process.execPath, ["tools/continuous-review/intake.mjs", "--source", "Z:/missing", "--target", "review_match_005", "--dry-run"], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /^protected_target_id:/u);
  assert.doesNotMatch(rejected.stderr, /\n\s+at /u);
});

test("new module does not invoke parser, ASR, synchronization, copying or product registration", async () => {
  const files = ["intake-model.mjs", "intake-paths.mjs", "intake.mjs"];
  const source = (await Promise.all(files.map((file) => readFile(new URL(`../tools/continuous-review/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /packages[\\/]deadem|copyFile|spawn\(|execFile|ffmpeg|whisper|product-view-model|review-presentation|scrim-presentation/iu);
  assert.equal(source.includes("createReadStream"), true);
});

test("no local intake media or manifest is tracked by Git", () => {
  const tracked = execFileSync("git", ["ls-files", ".local/deadem/continuous-review", "*.dem", "*.mp4", "*.aac", "*.wav"], { encoding: "utf8" }).trim();
  assert.equal(tracked, "");
});
