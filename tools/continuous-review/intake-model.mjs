import { createHash } from "node:crypto";

export const LEGACY_TARGET_IDS = Object.freeze(["review_match_001", "review_match_002", "review_match_003", "review_match_004"]);
export const PROTECTED_TARGET_IDS = Object.freeze(["review_match_005", "review_match_006", "review_match_007", "review_match_008"]);
export const TRACK_ORDERING = "natural_filename_order_en_numeric";
export const READY_STATUS = "ready_for_factual_processing";

const protectedAlias = /(?:^|[\\/._-])(?:replay|review[_-]?match|match|partida)[_-]?00[5-8](?=$|[\\/._-])/iu;
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export class IntakeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IntakeError";
    this.code = code;
  }
}

export function assertNoProtectedAlias(value) {
  const text = String(value ?? "");
  if (protectedAlias.test(text)) {
    throw new IntakeError("protected_target_id", "O identificador ou path referencia um target 005–008 reservado e foi rejeitado antes de qualquer acesso ao filesystem.");
  }
  return text;
}

export function assertContinuousReviewTargetId(value) {
  const id = assertNoProtectedAlias(value);
  const match = /^review_match_(\d{3})$/u.exec(id);
  if (!match) throw new IntakeError("invalid_target_id", "Use o formato review_match_NNN.");
  const number = Number(match[1]);
  if (number >= 1 && number <= 4) {
    throw new IntakeError("legacy_target_id", `${id} pertence ao histórico aceito 001–004 e não pode ser registrado pelo intake contínuo.`);
  }
  if (number < 9 || number > 999) {
    throw new IntakeError("invalid_target_id", "Novos targets de continuous review devem estar entre review_match_009 e review_match_999.");
  }
  return id;
}

export function assertSafeSourceText(value) {
  if (typeof value !== "string" || !value.trim()) throw new IntakeError("invalid_source_path", "Informe uma pasta local em --source.");
  if (value.includes("\0")) throw new IntakeError("invalid_source_path", "O source contém null byte e foi rejeitado.");
  assertNoProtectedAlias(value);
  const segments = value.replaceAll("\\", "/").split("/");
  if (segments.includes("..")) throw new IntakeError("invalid_source_path", "Traversal com '..' não é permitido em --source.");
  return value;
}

export function naturalFilenameCompare(left, right) {
  const primary = natural.compare(left, right);
  return primary || (left < right ? -1 : left > right ? 1 : 0);
}

export function stableHash(parts) {
  return createHash("sha256").update(parts.map((part) => String(part)).join("\n")).digest("hex");
}

export function buildManifest({ reviewTargetId, sourceRoot, replay, video, communication }) {
  const target = assertContinuousReviewTargetId(reviewTargetId);
  const orderedTrackHashes = communication.tracks.map((track) => track.sha256);
  const coreInputFingerprint = stableHash(["continuous-review-core-v1", replay.sha256, video.sha256]);
  const intakeFingerprint = stableHash(["continuous-review-intake-v1", target, replay.sha256, video.sha256, ...orderedTrackHashes]);
  const status = communication.status === "supplied_with_gap" ? "communication_supplied_with_gap" : READY_STATUS;
  return {
    schemaVersion: 1,
    artifactClass: "continuous_review_intake",
    reviewTargetId: target,
    status,
    association: {
      method: "human_supplied_local_scrim_bundle",
      ambiguityCount: 0,
    },
    source: {
      rootPath: sourceRoot,
      copyPolicy: "reference_in_place_no_copy",
    },
    inputs: { replay, video, communication },
    metadata: {
      factual: {
        replayFormat: replay.format,
        replaySizeBytes: replay.sizeBytes,
        videoFormat: video.format,
        videoSizeBytes: video.sizeBytes,
        videoDurationSeconds: video.durationSeconds,
        provenance: "factual/local_file_identity",
      },
      humanSupplied: {
        reviewTargetId: target,
        provenance: "human_supplied/intake_target_assignment",
      },
      inferred: {
        values: [],
        provenance: "inferred/none",
      },
    },
    provenance: {
      association: "human_supplied/intake_target_assignment",
      replay: "factual/local_file_identity",
      video: "factual/local_file_identity",
      communication: communication.provenance,
      gameplayAnalysisPerformed: false,
      automaticAttributionPerformed: false,
    },
    coreInputFingerprint,
    intakeFingerprint,
  };
}

export function formatDuration(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

export function safeCliSummary({ outcome, manifest, manifestRelativePath, dryRun }) {
  const supplied = manifest.inputs.communication.status === "not_supplied"
    ? "— not supplied"
    : manifest.inputs.communication.status === "supplied_with_gap"
      ? "! supplied folder has no AAC tracks"
      : `✓ ${manifest.inputs.communication.trackCount} tracks supplied (unprocessed)`;
  return [
    `Target: ${manifest.reviewTargetId}`,
    "Replay: ✓ PBDEMS2 header and identity recorded",
    `Video: ✓ MP4, ${formatDuration(manifest.inputs.video.durationSeconds)} duration`,
    `Communication: ${supplied}`,
    `Status: ${manifest.status.toUpperCase()}`,
    `Result: ${outcome}`,
    dryRun ? "Manifest: not written (dry-run)" : `Manifest: ${manifestRelativePath}`,
    "Gameplay analysis: not executed",
  ].join("\n");
}
