#!/usr/bin/env node
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { executeIntake } from "./intake.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_CANARY_ROOT = path.join(ROOT, ".local/codex/218/canary");

function box(type, payload) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 4, "ascii");
  payload.copy(result, 8);
  return result;
}

export function syntheticMp4(durationSeconds = 12.345) {
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

export function syntheticReplay(marker = 1) {
  const bytes = Buffer.alloc(64);
  bytes.write("PBDEMS2\0", 0, 8, "ascii");
  bytes.writeUInt32LE(32, 8);
  bytes.writeUInt32LE(marker, 48);
  return bytes;
}

export async function createSyntheticBundle(root, { marker = 1, tracks = 0, supportFiles = false, craigDirectory = tracks > 0 } = {}) {
  await Promise.all([
    mkdir(path.join(root, "replay"), { recursive: true }),
    mkdir(path.join(root, "video"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "replay/input.dem"), syntheticReplay(marker)),
    writeFile(path.join(root, "video/input.mp4"), syntheticMp4(75.25 + marker)),
  ]);
  if (craigDirectory) {
    await mkdir(path.join(root, "craig"), { recursive: true });
    for (let index = 1; index <= tracks; index += 1) {
      await writeFile(path.join(root, "craig", `speaker-${index}.aac`), Buffer.from(`synthetic-aac-${marker}-${index}`));
    }
    if (supportFiles) {
      await Promise.all([
        writeFile(path.join(root, "craig/info.txt"), "synthetic fixture only\n"),
        writeFile(path.join(root, "craig/raw.dat"), Buffer.from("synthetic-raw")),
      ]);
    }
  }
}

async function exists(file) {
  try { await stat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

export async function runCanary(canaryRoot = DEFAULT_CANARY_ROOT) {
  const resolved = path.resolve(canaryRoot);
  const allowed = path.resolve(DEFAULT_CANARY_ROOT);
  if (resolved !== allowed && !resolved.startsWith(`${allowed}${path.sep}`)) throw new Error("canary root must remain under .local/codex/218/canary");
  await rm(resolved, { recursive: true, force: true });
  const registryRoot = path.join(resolved, "registry");
  const noCraig = path.join(resolved, "fixtures/no-craig");
  const withCraig = path.join(resolved, "fixtures/with-craig");
  await createSyntheticBundle(noCraig, { marker: 9 });
  await createSyntheticBundle(withCraig, { marker: 10, tracks: 3, supportFiles: true });

  const target009Manifest = path.join(registryRoot, "review_match_009/manifest.json");
  const dryRun = await executeIntake({ source: noCraig, target: "review_match_009", mode: "dry-run", registryRoot });
  const dryRunManifestWritten = await exists(target009Manifest);
  const firstRegister = await executeIntake({ source: noCraig, target: "review_match_009", mode: "register", registryRoot });
  const firstManifest = JSON.parse(await readFile(target009Manifest, "utf8"));
  const secondRegister = await executeIntake({ source: noCraig, target: "review_match_009", mode: "register", registryRoot });
  await writeFile(path.join(noCraig, "replay/input.dem"), syntheticReplay(99));
  let conflictCode = null;
  try {
    await executeIntake({ source: noCraig, target: "review_match_009", mode: "register", registryRoot });
  } catch (error) {
    conflictCode = error.code;
  }
  const withCommunication = await executeIntake({ source: withCraig, target: "review_match_010", mode: "register", registryRoot });

  const result = {
    taskId: "218",
    fixtureClass: "synthetic_temp_only",
    registryIsolation: ".local/codex/218/canary/registry",
    dryRun: { outcome: dryRun.outcome, manifestWritten: dryRunManifestWritten },
    withoutCommunication: {
      firstRegister: firstRegister.outcome,
      secondRegister: secondRegister.outcome,
      communicationStatus: firstManifest.inputs.communication.status,
    },
    conflict: { code: conflictCode, rejected: conflictCode === "target_input_identity_conflict" },
    withCommunication: {
      outcome: withCommunication.outcome,
      communicationStatus: withCommunication.manifest.inputs.communication.status,
      trackCount: withCommunication.manifest.inputs.communication.trackCount,
      supportFiles: withCommunication.manifest.inputs.communication.supportFiles,
    },
    newRealMatchRegistered: false,
    protectedAccessCount: 0,
    replayProcessingCount: 0,
    asrExecutionCount: 0,
    synchronizationExecutionCount: 0,
    candidateGenerationCount: 0,
    frameExtractionCount: 0,
    mediaCopyCount: 0,
    factualGameplayFactCount: 0,
    automaticAttributionCount: 0,
  };
  await writeFile(path.join(resolved, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  runCanary().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
