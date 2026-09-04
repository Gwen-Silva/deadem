#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateJsonSchema } from "../lib/json-schema-validator.mjs";
import {
  IntakeError,
  assertContinuousReviewTargetId,
  buildManifest,
  safeCliSummary,
  stableHash,
} from "./intake-model.mjs";
import { inspectSourceBundle } from "./intake-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_REGISTRY_ROOT = path.join(ROOT, ".local/deadem/continuous-review/intakes");
const SCHEMA_PATH = path.join(ROOT, "schemas/continuous-review-intake.schema.json");
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function validateManifest(manifest) {
  const result = validateJsonSchema(schema, manifest);
  if (!result.valid) throw new IntakeError("invalid_manifest", `Manifest local inválido: ${result.errors.join("; ")}`);
  const communication = manifest.inputs.communication;
  if (communication.trackCount !== communication.tracks.length) throw new IntakeError("invalid_manifest", "Manifest local inválido: trackCount não corresponde a tracks.");
  for (const [index, track] of communication.tracks.entries()) {
    const expectedIndex = index + 1;
    if (track.index !== expectedIndex || track.localIdentifier !== `track_${String(expectedIndex).padStart(3, "0")}`) {
      throw new IntakeError("invalid_manifest", "Manifest local inválido: ordering/índices Craig inconsistentes.");
    }
  }
  if (communication.status === "not_supplied" && communication.trackCount !== 0) throw new IntakeError("invalid_manifest", "Manifest local inválido: comunicação não fornecida contém tracks.");
  if (communication.status === "supplied_unprocessed" && communication.trackCount < 1) throw new IntakeError("invalid_manifest", "Manifest local inválido: comunicação fornecida não contém AAC.");
  if (communication.status === "supplied_with_gap" && communication.trackCount !== 0) throw new IntakeError("invalid_manifest", "Manifest local inválido: gap de comunicação contém tracks.");
  if (manifest.inputs.replay.summaryOffset >= manifest.inputs.replay.sizeBytes) throw new IntakeError("invalid_manifest", "Manifest local inválido: summary offset fora do replay.");
  if (manifest.metadata.humanSupplied.reviewTargetId !== manifest.reviewTargetId) throw new IntakeError("invalid_manifest", "Manifest local inválido: target humano inconsistente.");
  const core = stableHash(["continuous-review-core-v1", manifest.inputs.replay.sha256, manifest.inputs.video.sha256]);
  const intake = stableHash(["continuous-review-intake-v1", manifest.reviewTargetId, manifest.inputs.replay.sha256, manifest.inputs.video.sha256, ...communication.tracks.map((track) => track.sha256)]);
  if (manifest.coreInputFingerprint !== core || manifest.intakeFingerprint !== intake) throw new IntakeError("invalid_manifest", "Manifest local inválido: fingerprint inconsistente.");
  return result;
}

async function readManifest(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    validateManifest(value);
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new IntakeError("invalid_registry_manifest", `Manifest local inválido em ${path.basename(path.dirname(file))}.`);
    throw error;
  }
}

export function assertRegistryEntryName(name) {
  try {
    return assertContinuousReviewTargetId(name);
  } catch (error) {
    if (error?.code === "protected_target_id") throw error;
    throw new IntakeError("invalid_registry_entry", "O registry contém uma entrada fora do namespace contínuo review_match_009–review_match_999.");
  }
}

export async function registrationDecision(
  manifest,
  registryRoot,
  { readRegistryEntries = readdir, readRegistryManifest = readManifest } = {},
) {
  const targetManifestPath = path.join(registryRoot, manifest.reviewTargetId, "manifest.json");
  let entries = [];
  try {
    entries = await readRegistryEntries(registryRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) throw new IntakeError("invalid_registry_entry", "O registry contém uma entrada que não é um diretório de target válido.");
    assertRegistryEntryName(entry.name);
  }
  const existingTarget = await readRegistryManifest(targetManifestPath);
  if (existingTarget) {
    if (existingTarget.intakeFingerprint === manifest.intakeFingerprint) {
      return { outcome: "already_registered_same_inputs", manifestPath: targetManifestPath, existingManifest: existingTarget };
    }
    throw new IntakeError("target_input_identity_conflict", "Este target já está registrado com arquivos diferentes.");
  }
  for (const entry of entries) {
    if (entry.name === manifest.reviewTargetId) continue;
    const other = await readRegistryManifest(path.join(registryRoot, entry.name, "manifest.json"));
    if (other?.coreInputFingerprint === manifest.coreInputFingerprint) {
      throw new IntakeError("input_bundle_already_registered", "Este conjunto replay+video já está registrado sob outro target.");
    }
  }
  return { outcome: "registered", manifestPath: targetManifestPath, existingManifest: null };
}

async function publishAtomic(manifest, registryRoot, manifestPath) {
  await mkdir(registryRoot, { recursive: true });
  const targetDirectory = path.dirname(manifestPath);
  let createdTargetDirectory = false;
  try {
    await mkdir(targetDirectory, { recursive: false });
    createdTargetDirectory = true;
  } catch (error) {
    if (error?.code === "EEXIST") throw new IntakeError("target_registry_entry_incomplete", "O diretório deste target já existe sem um manifest válido; nenhuma sobrescrita foi feita.");
    throw error;
  }
  const temporary = path.join(targetDirectory, `.manifest.json.tmp-${process.pid}`);
  try {
    await writeFile(temporary, jsonBytes(manifest), { flag: "wx" });
    await rename(temporary, manifestPath);
  } catch (error) {
    try { await unlink(temporary); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    if (createdTargetDirectory) {
      try { await rmdir(targetDirectory); } catch (cleanupError) { if (!["ENOENT", "ENOTEMPTY"].includes(cleanupError?.code)) throw cleanupError; }
    }
    throw error;
  }
}

export async function executeIntake({ source, target, mode, registryRoot = DEFAULT_REGISTRY_ROOT } = {}) {
  const reviewTargetId = assertContinuousReviewTargetId(target);
  if (!new Set(["dry-run", "register"]).has(mode)) throw new IntakeError("invalid_mode", "Escolha exatamente um modo: --dry-run ou --register.");
  const inspected = await inspectSourceBundle(source);
  const manifest = buildManifest({ reviewTargetId, ...inspected });
  validateManifest(manifest);
  const relativeManifestPath = `.local/deadem/continuous-review/intakes/${reviewTargetId}/manifest.json`;
  if (mode === "dry-run") {
    return { outcome: "validated_dry_run", manifest, manifestPath: null, manifestRelativePath: relativeManifestPath, dryRun: true };
  }
  const decision = await registrationDecision(manifest, registryRoot);
  if (decision.existingManifest) {
    return { outcome: decision.outcome, manifest: decision.existingManifest, manifestPath: decision.manifestPath, manifestRelativePath: relativeManifestPath, dryRun: false };
  }
  await publishAtomic(manifest, registryRoot, decision.manifestPath);
  return { outcome: decision.outcome, manifest, manifestPath: decision.manifestPath, manifestRelativePath: relativeManifestPath, dryRun: false };
}

export function parseArguments(argv) {
  const parsed = { help: false, source: null, target: null, dryRun: false, register: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") parsed.help = true;
    else if (argument === "--source") parsed.source = argv[++index];
    else if (argument === "--target") parsed.target = argv[++index];
    else if (argument === "--dry-run") parsed.dryRun = true;
    else if (argument === "--register") parsed.register = true;
    else throw new IntakeError("invalid_argument", `Argumento não reconhecido: ${argument}`);
  }
  if (parsed.help) return parsed;
  if (!parsed.source || !parsed.target) throw new IntakeError("missing_argument", "--source e --target são obrigatórios.");
  if (parsed.dryRun === parsed.register) throw new IntakeError("invalid_mode", "Escolha exatamente um modo: --dry-run ou --register.");
  return parsed;
}

export const HELP = `AlphaVeil Generic Scrim Intake V1

Uso (PowerShell):
  npm.cmd run review:intake -- --source ".local/deadem/inbox/scrim" --target review_match_009 --dry-run
  npm.cmd run review:intake -- --source ".local/deadem/inbox/scrim" --target review_match_009 --register

Estrutura:
  <source>/replay/  exatamente um arquivo .dem
  <source>/video/   exatamente um arquivo .mp4
  <source>/craig/   opcional; zero ou mais .aac, info.txt e raw.dat

Targets 001–004 são históricos. 005–008 são reservados e rejeitados antes do filesystem.
Novos targets devem usar review_match_009 até review_match_999.
--dry-run valida e não escreve manifest. --register publica o manifest local atomicamente.
O intake não analisa gameplay, não executa ASR, não sincroniza e não copia mídia.
`;

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const result = await executeIntake({
    source: args.source,
    target: args.target,
    mode: args.dryRun ? "dry-run" : "register",
  });
  process.stdout.write(`${safeCliSummary(result)}\n`);
}

if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url) {
  main().catch((error) => {
    const code = error instanceof IntakeError ? error.code : "unexpected_intake_error";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
