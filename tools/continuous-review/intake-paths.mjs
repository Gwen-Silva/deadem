import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import {
  IntakeError,
  TRACK_ORDERING,
  assertNoProtectedAlias,
  assertSafeSourceText,
  naturalFilenameCompare,
} from "./intake-model.mjs";

const defaultIo = { lstat, open, readdir, realpath };

function samePath(left, right) {
  const normalize = (value) => path.resolve(value).replaceAll("\\", "/").replace(/\/$/u, "");
  const a = normalize(left);
  const b = normalize(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function assertRealDirectory(stat, label) {
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new IntakeError("unsafe_input_path", `${label} precisa ser um diretório real, não um symlink.`);
  }
}

export function assertRegularFile(stat, label) {
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new IntakeError("unsafe_input_path", `${label} precisa ser um arquivo regular, não um symlink ou diretório.`);
  }
}

async function resolveRealDirectory(directory, label, io = defaultIo) {
  assertNoProtectedAlias(directory);
  let stat;
  try {
    stat = await io.lstat(directory);
  } catch (error) {
    if (error?.code === "ENOENT") throw new IntakeError("invalid_required_input", `${label} não existe.`);
    throw error;
  }
  assertRealDirectory(stat, label);
  const resolved = await io.realpath(directory);
  if (!samePath(resolved, directory)) throw new IntakeError("unsafe_input_path", `${label} foi redirecionado e não será seguido.`);
  return path.resolve(resolved);
}

export async function resolveSourceRoot(source, io = defaultIo) {
  assertSafeSourceText(source);
  return resolveRealDirectory(path.resolve(source), "A pasta source", io);
}

async function resolveExclusiveFile(directory, extension, label, io = defaultIo) {
  const entries = await io.readdir(directory, { withFileTypes: true });
  const eligible = entries.filter((entry) => entry.name.toLowerCase().endsWith(extension));
  if (entries.length !== 1 || eligible.length !== 1) {
    const description = extension === ".dem"
      ? "Esperado exatamente um replay .dem em replay/."
      : "A pasta video/ precisa conter exatamente um MP4.";
    throw new IntakeError("invalid_required_input", description);
  }
  const entry = eligible[0];
  if (!entry.isFile() || entry.isSymbolicLink()) throw new IntakeError("unsafe_input_path", `${label} precisa ser um arquivo regular, não um symlink.`);
  assertNoProtectedAlias(entry.name);
  const file = path.join(directory, entry.name);
  const stat = await io.lstat(file);
  assertRegularFile(stat, label);
  const resolved = await io.realpath(file);
  if (!samePath(resolved, file)) throw new IntakeError("unsafe_input_path", `${label} foi redirecionado e não será seguido.`);
  return { path: path.resolve(resolved), sizeBytes: stat.size };
}

export async function hashFileStreaming(file) {
  assertNoProtectedAlias(file);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) hash.update(chunk);
  return hash.digest("hex");
}

export function validateReplayHeader(bytes, sizeBytes) {
  if (bytes.length < 16 || bytes.subarray(0, 8).toString("ascii") !== "PBDEMS2\0") {
    throw new IntakeError("invalid_required_input", "O replay não possui assinatura PBDEMS2 válida.");
  }
  const summaryOffset = bytes.readUInt32LE(8);
  if (summaryOffset < 16 || summaryOffset >= sizeBytes) {
    throw new IntakeError("invalid_required_input", "O summary offset do replay é estruturalmente inválido.");
  }
  return {
    format: "source2_demo_pbde_ms2",
    signature: "PBDEMS2",
    summaryOffset,
    probeMethod: "pbde_ms2_header_only",
  };
}

export async function probeReplay(file, sizeBytes) {
  assertNoProtectedAlias(file);
  const handle = await open(file, "r");
  try {
    const bytes = Buffer.alloc(16);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return validateReplayHeader(bytes.subarray(0, bytesRead), sizeBytes);
  } finally {
    await handle.close();
  }
}

async function readBoxHeader(handle, offset, boundary) {
  if (offset + 8 > boundary) return null;
  const header = Buffer.alloc(16);
  const { bytesRead } = await handle.read(header, 0, header.length, offset);
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
  return { type, payloadOffset: offset + headerSize, end: offset + size };
}

export async function probeMp4(file, sizeBytes) {
  assertNoProtectedAlias(file);
  const handle = await open(file, "r");
  try {
    const first = Buffer.alloc(16);
    const firstRead = await handle.read(first, 0, first.length, 0);
    if (firstRead.bytesRead < 12 || first.toString("ascii", 4, 8) !== "ftyp") {
      throw new IntakeError("invalid_required_input", "O vídeo não é um ISO Base Media MP4 válido (ftyp ausente).");
    }
    const majorBrand = first.toString("ascii", 8, 12);
    let offset = 0;
    let moov;
    while (offset < sizeBytes) {
      const box = await readBoxHeader(handle, offset, sizeBytes);
      if (!box) break;
      if (box.type === "moov") { moov = box; break; }
      offset = box.end;
    }
    if (!moov) throw new IntakeError("invalid_required_input", "O MP4 não contém box moov.");
    offset = moov.payloadOffset;
    let mvhd;
    while (offset < moov.end) {
      const box = await readBoxHeader(handle, offset, moov.end);
      if (!box) break;
      if (box.type === "mvhd") { mvhd = box; break; }
      offset = box.end;
    }
    if (!mvhd) throw new IntakeError("invalid_required_input", "O MP4 não contém duração mvhd válida.");
    const payload = Buffer.alloc(Math.min(40, mvhd.end - mvhd.payloadOffset));
    const read = await handle.read(payload, 0, payload.length, mvhd.payloadOffset);
    if (read.bytesRead < 20) throw new IntakeError("invalid_required_input", "O metadata mvhd do MP4 está truncado.");
    const version = payload.readUInt8(0);
    if (version !== 0 && version !== 1) throw new IntakeError("invalid_required_input", "A versão mvhd do MP4 não é suportada.");
    const timescale = version === 1 ? payload.readUInt32BE(20) : payload.readUInt32BE(12);
    const durationUnits = version === 1 ? Number(payload.readBigUInt64BE(24)) : payload.readUInt32BE(16);
    const durationSeconds = durationUnits / timescale;
    if (!timescale || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new IntakeError("invalid_required_input", "A duração do MP4 precisa ser maior que zero.");
    }
    return {
      format: "iso_base_media_mp4",
      majorBrand,
      durationSeconds: Number(durationSeconds.toFixed(3)),
      probeMethod: "mp4_mvhd_random_access",
    };
  } finally {
    await handle.close();
  }
}

export async function resolveCraig(sourceRoot, io = defaultIo, { hashFile = hashFileStreaming } = {}) {
  const craigDirectory = path.join(sourceRoot, "craig");
  let craigStat;
  try {
    craigStat = await io.lstat(craigDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        status: "not_supplied",
        trackCount: 0,
        ordering: TRACK_ORDERING,
        tracks: [],
        supportFiles: { infoTxt: false, rawDat: false },
        provenance: "unprocessed/not_supplied",
      };
    }
    throw error;
  }
  assertRealDirectory(craigStat, "A pasta craig/");
  const resolved = await io.realpath(craigDirectory);
  if (!samePath(resolved, craigDirectory)) throw new IntakeError("unsafe_input_path", "A pasta craig/ foi redirecionada e não será seguida.");
  const entries = await io.readdir(craigDirectory, { withFileTypes: true });
  for (const entry of entries) assertNoProtectedAlias(entry.name);
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new IntakeError("unsafe_input_path", "craig/ não pode conter symlinks ou diretórios aninhados.");
  }
  const allowed = entries.filter((entry) => entry.name.toLowerCase().endsWith(".aac") || ["info.txt", "raw.dat"].includes(entry.name.toLowerCase()));
  if (allowed.length !== entries.length) throw new IntakeError("invalid_communication_input", "craig/ contém um item não suportado; use apenas .aac, info.txt e raw.dat.");
  const trackEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith(".aac")).sort((a, b) => naturalFilenameCompare(a.name, b.name));
  const tracks = [];
  for (const [index, entry] of trackEntries.entries()) {
    const file = path.join(craigDirectory, entry.name);
    const stat = await io.lstat(file);
    assertRegularFile(stat, "Track Craig");
    const fileResolved = await io.realpath(file);
    if (!samePath(fileResolved, file)) throw new IntakeError("unsafe_input_path", "Um track Craig foi redirecionado e não será seguido.");
    tracks.push({
      index: index + 1,
      localIdentifier: `track_${String(index + 1).padStart(3, "0")}`,
      sourcePath: path.resolve(fileResolved),
      extension: ".aac",
      sizeBytes: stat.size,
      sha256: await hashFile(fileResolved),
      provenance: "unprocessed/local_audio_bundle",
    });
  }
  return {
    status: tracks.length ? "supplied_unprocessed" : "supplied_with_gap",
    trackCount: tracks.length,
    ordering: TRACK_ORDERING,
    tracks,
    supportFiles: {
      infoTxt: entries.some((entry) => entry.name.toLowerCase() === "info.txt"),
      rawDat: entries.some((entry) => entry.name.toLowerCase() === "raw.dat"),
    },
    provenance: tracks.length ? "unprocessed/local_audio_bundle" : "unprocessed/communication_folder_without_tracks",
  };
}

export async function inspectSourceBundle(source, io = defaultIo) {
  const sourceRoot = await resolveSourceRoot(source, io);
  const replayDirectory = await resolveRealDirectory(path.join(sourceRoot, "replay"), "A pasta replay/", io);
  const videoDirectory = await resolveRealDirectory(path.join(sourceRoot, "video"), "A pasta video/", io);
  const replayFile = await resolveExclusiveFile(replayDirectory, ".dem", "O replay", io);
  const videoFile = await resolveExclusiveFile(videoDirectory, ".mp4", "O vídeo", io);
  const [replayProbe, replaySha256, videoProbe, videoSha256, communication] = await Promise.all([
    probeReplay(replayFile.path, replayFile.sizeBytes),
    hashFileStreaming(replayFile.path),
    probeMp4(videoFile.path, videoFile.sizeBytes),
    hashFileStreaming(videoFile.path),
    resolveCraig(sourceRoot, io),
  ]);
  return {
    sourceRoot,
    replay: {
      status: "available",
      sourcePath: replayFile.path,
      localIdentifier: "replay_input",
      extension: ".dem",
      sizeBytes: replayFile.sizeBytes,
      sha256: replaySha256,
      ...replayProbe,
      provenance: "factual/local_file_identity",
    },
    video: {
      status: "available",
      sourcePath: videoFile.path,
      localIdentifier: "video_input",
      extension: ".mp4",
      sizeBytes: videoFile.sizeBytes,
      sha256: videoSha256,
      ...videoProbe,
      provenance: "factual/local_file_identity",
    },
    communication,
  };
}
