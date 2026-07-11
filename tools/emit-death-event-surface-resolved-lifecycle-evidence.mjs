#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Logger, Player } from "deadem";
import { validateJsonSchema } from "./lib/json-schema-validator.mjs";
import { publishRunOutcome } from "./emit-death-event-directional-discrimination-evidence.mjs";
import {
  calculateAssignmentLedger,
  validateExactManifest,
  validateExactPilotGate,
  validateManifestSourcesBeforeReplay,
} from "./validate-task189-lifecycle-integrity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT =
  "output/local-replay-processing/death-event-surface-resolved-lifecycle-evidence/";
const INTEGRITY_GATE = `${OUTPUT}integrity/task189-lifecycle-integrity-gate.json`;
const SCHEMA_PATH =
  "schemas/death-event-surface-resolved-lifecycle-evidence.schema.json";
const FAMILIES = [
  "healthBoundary",
  "booleanAlive",
  "respawnBoundary",
  "pawnLinkPresence",
];
const HORIZONS = [10, 20, 30, 60, 120, 180];
const EXPECTED_ORIGIN = {
  healthBoundary: "positive",
  booleanAlive: true,
  respawnBoundary: "non_positive",
  pawnLinkPresence: true,
};
const EXPECTED = new Map([
  ["task190-pilot", 341],
  ["task190-bounded32", 2552],
]);
const FORBIDDEN = new Set([
  "replay_005",
  "replay_006",
  "replay_007",
  "replay_008",
]);
const MAX_ARTIFACT = 2 * 1024 * 1024;
const MAX_RUN = 48 * 1024 * 1024;

async function readJson(relative) {
  return JSON.parse(await readFile(path.resolve(ROOT, relative), "utf8"));
}
async function writeJson(relative, value) {
  const target = path.resolve(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}
function bytes(value) {
  return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`);
}
function rate(count, total) {
  return total ? Number((count / total).toFixed(6)) : 0;
}
function diff(left, right) {
  return Number((left - right).toFixed(6));
}
function six(value) {
  return String(value).padStart(6, "0");
}
function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function equality(left, right) {
  return typeof left === typeof right && left === right;
}
function audit(
  measurement,
  {
    integrity = true,
    measurementCompleted = true,
    operational = null,
    promotion = null,
  } = {}
) {
  return {
    schemaVersion: 1,
    integrityStatus: integrity ? "passed" : "failed",
    measurementStatus: measurementCompleted ? "completed" : "blocked",
    operationalThresholdStatus:
      operational === null ? "not_applicable" : operational ? "met" : "not_met",
    promotionSupportThresholdStatus:
      promotion === null ? "not_applicable" : promotion ? "met" : "not_met",
    ...measurement,
  };
}
function normalize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return value.trim() || null;
  return null;
}
function strictBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && (value === 0 || value === 1))
    return value === 1;
  if (typeof value === "bigint" && (value === 0n || value === 1n))
    return value === 1n;
  return null;
}
function field(entity, candidates) {
  if (!entity) return null;
  for (const name of candidates) {
    try {
      const value = entity.getField(name);
      if (value !== null && value !== undefined) return value;
    } catch {
      /* optional probe */
    }
  }
  return null;
}
function boundary(entity, names) {
  const value = safeNumber(field(entity, names));
  return value === null ? null : value <= 0 ? "non_positive" : "positive";
}
function linkedPawn(player, raw) {
  const handle = safeNumber(raw);
  if (!Number.isInteger(handle)) return null;
  try {
    return player.getDemo().getEntityByHandle(handle);
  } catch {
    return null;
  }
}
function seed(controller, ordinal) {
  return (
    normalize(
      field(controller, [
        "m_iPlayerSlot",
        "m_iPlayerID",
        "m_unAccountID",
        "m_iAccountID",
        "m_steamID",
      ])
    ) ?? `controller-${ordinal}`
  );
}
function entityState(entity) {
  const respawn = safeNumber(
    field(entity, ["m_iRespawnTime", "m_flRespawnTime", "m_nRespawnTime"])
  );
  return {
    healthBoundary: boundary(entity, ["m_iHealth", "m_nHealth", "m_flHealth"]),
    booleanAlive: strictBoolean(field(entity, ["m_bAlive", "m_bIsAlive"])),
    respawnBoundary:
      respawn === null ? null : respawn <= 0 ? "non_positive" : "positive",
  };
}
function surfaceState(controllerState, pawnState, linkPresent) {
  return {
    healthBoundary: {
      controller: controllerState.healthBoundary,
      linked_pawn: pawnState.healthBoundary,
      link_relation: null,
    },
    booleanAlive: {
      controller: controllerState.booleanAlive,
      linked_pawn: pawnState.booleanAlive,
      link_relation: null,
    },
    respawnBoundary: {
      controller: controllerState.respawnBoundary,
      linked_pawn: pawnState.respawnBoundary,
      link_relation: null,
    },
    pawnLinkPresence: {
      controller: null,
      linked_pawn: null,
      link_relation: linkPresent,
    },
  };
}
function observe(player, aggregate, second) {
  const controllers = player
    .getDemo()
    .getEntitiesByClassName("CCitadelPlayerController");
  let ordinal = 0;
  for (const controller of controllers) {
    ordinal += 1;
    const participantSeed = seed(controller, ordinal);
    aggregate.seeds.add(participantSeed);
    const pawn = linkedPawn(
      player,
      field(controller, ["m_hPawn", "m_hAssignedHero", "m_hHeroPawn"])
    );
    const states = surfaceState(
      entityState(controller),
      entityState(pawn),
      pawn !== null
    );
    if (!aggregate.samples.has(participantSeed))
      aggregate.samples.set(participantSeed, []);
    aggregate.samples.get(participantSeed).push({ second, states });
  }
}
function deriveEvents(samples) {
  const events = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    for (const family of FAMILIES)
      for (const surface of ["controller", "linked_pawn", "link_relation"]) {
        const from = previous.states[family][surface];
        const to = current.states[family][surface];
        if (
          from === null ||
          to === null ||
          from === "conflict" ||
          to === "conflict" ||
          equality(from, to)
        )
          continue;
        const origin = EXPECTED_ORIGIN[family];
        const direction =
          equality(from, origin) && !equality(to, origin)
            ? "forward"
            : !equality(from, origin) && equality(to, origin)
            ? "inverse"
            : "recurrence";
        events.push({
          family,
          surface,
          second: current.second,
          direction,
          toState: to,
          key: "",
        });
      }
  }
  return events.sort(
    (left, right) =>
      left.second - right.second ||
      left.family.localeCompare(right.family) ||
      left.surface.localeCompare(right.surface)
  );
}
function mapObserved(aggregate, identity) {
  const seeds = [...aggregate.seeds].sort(
    (left, right) =>
      Number(left) - Number(right) || String(left).localeCompare(String(right))
  );
  const participants = [...identity.participants].sort((left, right) =>
    left.participantKey.localeCompare(right.participantKey)
  );
  const samples = new Map();
  const sampleIndexes = new Map();
  const events = new Map();
  let failures = 0;
  seeds.forEach((participantSeed, index) => {
    const participantKey = participants[index]?.participantKey;
    if (!participantKey) {
      failures += 1;
      return;
    }
    const rows = aggregate.samples.get(participantSeed) ?? [];
    samples.set(participantKey, rows);
    sampleIndexes.set(
      participantKey,
      new Map(rows.map((row) => [row.second, row.states]))
    );
    events.set(
      participantKey,
      deriveEvents(rows).map((event, eventIndex) => ({
        ...event,
        key: `${participantKey}_surface_observation_${six(eventIndex + 1)}`,
      }))
    );
  });
  return {
    samples,
    sampleIndexes,
    events,
    failures,
    status:
      seeds.length === participants.length && failures === 0
        ? "passed"
        : "failed",
  };
}

export {
  mapObserved as mapReplayWideSurfaceObservations,
  observe as observeReplayWideSurfaceSample,
};

function surfaceStatus(events) {
  const surfaces = new Set(events.map((event) => event.surface));
  if (surfaces.has("link_relation")) return "controller_link_relation";
  if (surfaces.has("controller") && surfaces.has("linked_pawn"))
    return events.every((event) => equality(event.toState, events[0].toState))
      ? "controller_and_pawn_agree"
      : "controller_pawn_conflict";
  if (surfaces.has("controller")) return "controller_only";
  if (surfaces.has("linked_pawn")) return "linked_pawn_only";
  return "surface_unavailable";
}
function groupEvents(
  events,
  family,
  direction,
  used,
  minimumSecond,
  maximumSecond
) {
  const bySecond = new Map();
  for (const event of events)
    if (
      !used.has(event.key) &&
      event.family === family &&
      event.direction === direction &&
      event.second >= minimumSecond &&
      event.second <= maximumSecond
    ) {
      if (!bySecond.has(event.second)) bySecond.set(event.second, []);
      bySecond.get(event.second).push(event);
    }
  return [...bySecond.entries()]
    .map(([second, rows]) => {
      const simultaneousSurfaces = new Set(
        events
          .filter(
            (event) =>
              !used.has(event.key) &&
              event.family === family &&
              event.second === second
          )
          .map((event) => event.surface)
      );
      const opposingControllerPawnDirections =
        simultaneousSurfaces.has("controller") &&
        simultaneousSurfaces.has("linked_pawn") &&
        events.some(
          (event) =>
            !used.has(event.key) &&
            event.family === family &&
            event.second === second &&
            event.direction !== direction &&
            ["controller", "linked_pawn"].includes(event.surface)
        );
      return {
        second,
        events: rows,
        toState: rows[0].toState,
        surfaceStatus: opposingControllerPawnDirections
          ? "controller_pawn_conflict"
          : surfaceStatus(rows),
        keys: rows.map((row) => row.key),
      };
    })
    .sort((left, right) => left.second - right.second);
}
function nearestForward(referenceSecond, family, events, used, endSecond) {
  const groups = groupEvents(
    events,
    family,
    "forward",
    used,
    referenceSecond - 2,
    Math.min(referenceSecond + 2, endSecond)
  ).sort(
    (left, right) =>
      Math.abs(left.second - referenceSecond) -
        Math.abs(right.second - referenceSecond) || left.second - right.second
  );
  if (!groups.length) return { candidate: null, ambiguous: false };
  const distance = Math.abs(groups[0].second - referenceSecond);
  return groups.filter(
    (group) => Math.abs(group.second - referenceSecond) === distance
  ).length > 1
    ? { candidate: null, ambiguous: true }
    : { candidate: groups[0], ambiguous: false };
}
function firstInverse(
  referenceSecond,
  forward,
  family,
  events,
  used,
  endSecond
) {
  if (!forward) return null;
  return (
    groupEvents(
      events,
      family,
      "inverse",
      used,
      Math.max(referenceSecond, forward.second) + 1,
      endSecond
    )[0] ?? null
  );
}
function surfacesForStatus(status) {
  if (status === "controller_only") return ["controller"];
  if (status === "linked_pawn_only") return ["linked_pawn"];
  if (
    status === "controller_and_pawn_agree" ||
    status === "controller_pawn_conflict"
  )
    return ["controller", "linked_pawn"];
  if (status === "controller_link_relation") return ["link_relation"];
  return [];
}
function valuesAt(states, family, status) {
  return surfacesForStatus(status).map(
    (surface) => states?.[family]?.[surface] ?? null
  );
}
function eventRelativeOrigin(forward, family, samples, events) {
  if (!forward)
    return {
      status: "event_relative_insufficient_pre_state",
      surface: "surface_unavailable",
    };
  const statusSurface = forward.surfaceStatus;
  if (statusSurface === "controller_pawn_conflict")
    return {
      status: "event_relative_conflicting_pre_state",
      surface: statusSurface,
    };
  const window = samples.filter(
    (row) =>
      row.second >= forward.second - 3 && row.second <= forward.second - 1
  );
  const observed = window
    .map((row) => ({
      second: row.second,
      values: valuesAt(row.states, family, statusSurface),
    }))
    .filter(
      (row) =>
        row.values.length &&
        row.values.every((value) => value !== null && value !== "conflict")
    );
  if (
    window.some((row) =>
      valuesAt(row.states, family, statusSurface).some(
        (value) => value === "conflict"
      )
    )
  )
    return {
      status: "event_relative_conflicting_pre_state",
      surface: "controller_pawn_conflict",
    };
  if (observed.length < 2)
    return {
      status: "event_relative_insufficient_pre_state",
      surface: statusSurface,
    };
  const flat = observed.flatMap((row) => row.values);
  if (
    new Set(flat.map((value) => `${typeof value}:${String(value)}`)).size !== 1
  )
    return {
      status: "event_relative_conflicting_pre_state",
      surface: statusSurface,
    };
  if (!equality(flat[0], EXPECTED_ORIGIN[family]))
    return { status: "event_relative_wrong_origin", surface: statusSurface };
  const immediate = observed.find((row) => row.second === forward.second - 1);
  if (
    !immediate ||
    immediate.values.some((value) => !equality(value, EXPECTED_ORIGIN[family]))
  )
    return {
      status: "event_relative_missing_immediate_pre_sample",
      surface: statusSurface,
    };
  const earliest = observed[0].second;
  const selectedSurfaces = new Set(surfacesForStatus(statusSurface));
  if (
    events.some(
      (event) =>
        event.family === family &&
        selectedSurfaces.has(event.surface) &&
        event.second > earliest &&
        event.second < forward.second
    )
  )
    return {
      status: "event_relative_intervening_transition",
      surface: statusSurface,
    };
  return { status: "event_relative_origin_continuous", surface: statusSurface };
}
function persistence(candidate, family, sampleIndex, endSecond) {
  if (!candidate || candidate.second + 1 > endSecond)
    return {
      observed: false,
      contradiction: false,
      surface: candidate?.surfaceStatus ?? "surface_unavailable",
      confirmationSecond: null,
    };
  const first = valuesAt(
    sampleIndex.get(candidate.second),
    family,
    candidate.surfaceStatus
  );
  const second = valuesAt(
    sampleIndex.get(candidate.second + 1),
    family,
    candidate.surfaceStatus
  );
  const available =
    first.length &&
    second.length &&
    [...first, ...second].every(
      (value) => value !== null && value !== "conflict"
    );
  const observed =
    available &&
    [...first, ...second].every((value) => equality(value, candidate.toState));
  return {
    observed,
    contradiction: Boolean(available && !observed),
    surface: candidate.surfaceStatus,
    confirmationSecond: observed ? candidate.second + 1 : null,
  };
}
function reserve(
  candidate,
  used,
  assignments,
  reference,
  family,
  stage,
  cohort,
  horizonSeconds
) {
  if (!candidate) return;
  for (const key of candidate.keys) {
    used.add(key);
    assignments.push({
      horizonSeconds,
      cohort,
      participantKey: reference.participantKey,
      observationKey: key,
      referenceKey: reference.key,
      family,
      stage,
    });
  }
}
function emptyFamily(reason = "forward_not_observed") {
  return {
    eventRelativePreStateStatus: "event_relative_insufficient_pre_state",
    forwardObserved: false,
    forwardDeltaSeconds: null,
    forwardPersistenceObserved: false,
    inverseObserved: false,
    inverseDeltaSeconds: null,
    recoveryPersistenceObserved: false,
    completionDeltaSeconds: null,
    completeSameFamilyLifecycle: false,
    stageSurfaceStatus: {
      preState: "surface_unavailable",
      forward: "surface_unavailable",
      forwardPersistence: "surface_unavailable",
      inverse: "surface_unavailable",
      recoveryPersistence: "surface_unavailable",
    },
    failureReason: reason,
  };
}
function failureReason({
  origin,
  ambiguous,
  forward,
  forwardPersistence,
  inverse,
  recoveryPersistence,
  crossed,
}) {
  if (origin.status !== "event_relative_origin_continuous")
    return "pre_state_not_event_relative_continuous";
  if (ambiguous) return "forward_ambiguous";
  if (!forward) return "forward_not_observed";
  if (forwardPersistence.contradiction)
    return "forward_persistence_contradiction";
  if (!forwardPersistence.observed) return "forward_persistence_not_observed";
  if (crossed) return "cross_boundary_recovery";
  if (!inverse) return "inverse_not_observed_within_horizon";
  if (recoveryPersistence.contradiction)
    return "recovery_persistence_contradiction";
  if (!recoveryPersistence.observed) return "recovery_persistence_not_observed";
  return "none";
}

export function analyzeSurfaceCohort(
  references,
  mapped,
  cohort,
  horizonSeconds
) {
  const used = new Set();
  const assignments = [];
  const results = new Map();
  const ordered = [...references].sort(
    (left, right) =>
      left.participantKey.localeCompare(right.participantKey) ||
      left.second - right.second ||
      left.key.localeCompare(right.key)
  );
  for (const reference of ordered) {
    const samples = mapped.samples.get(reference.participantKey) ?? [];
    const sampleIndex =
      mapped.sampleIndexes.get(reference.participantKey) ?? new Map();
    const events = mapped.events.get(reference.participantKey) ?? [];
    const endSecond = reference.second + horizonSeconds;
    const families = {};
    let ambiguous = false;
    let contradiction = false;
    let crossed = false;
    for (const family of FAMILIES) {
      const selected = nearestForward(
        reference.second,
        family,
        events,
        used,
        endSecond
      );
      const forward = selected.candidate;
      ambiguous ||= selected.ambiguous;
      reserve(
        forward,
        used,
        assignments,
        reference,
        family,
        "forward",
        cohort,
        horizonSeconds
      );
      const origin = eventRelativeOrigin(forward, family, samples, events);
      const forwardPersistence = persistence(
        forward,
        family,
        sampleIndex,
        endSecond
      );
      contradiction ||=
        forwardPersistence.contradiction ||
        forward?.surfaceStatus === "controller_pawn_conflict";
      const inverse = firstInverse(
        reference.second,
        forward,
        family,
        events,
        used,
        endSecond
      );
      reserve(
        inverse,
        used,
        assignments,
        reference,
        family,
        "inverse",
        cohort,
        horizonSeconds
      );
      const recoveryPersistence = persistence(
        inverse,
        family,
        sampleIndex,
        endSecond
      );
      contradiction ||=
        recoveryPersistence.contradiction ||
        inverse?.surfaceStatus === "controller_pawn_conflict";
      const crossedHere = Boolean(
        forward &&
          reference.naturalBoundarySecond !== null &&
          !inverse &&
          events.some(
            (event) =>
              event.family === family &&
              event.direction === "inverse" &&
              event.second >= reference.naturalBoundarySecond &&
              event.second > forward.second &&
              event.second <= reference.second + 180
          )
      );
      crossed ||= crossedHere;
      const complete =
        origin.status === "event_relative_origin_continuous" &&
        Boolean(forward) &&
        forwardPersistence.observed &&
        Boolean(inverse) &&
        recoveryPersistence.observed &&
        !crossedHere &&
        forward.surfaceStatus !== "controller_pawn_conflict" &&
        inverse.surfaceStatus !== "controller_pawn_conflict";
      families[family] = {
        eventRelativePreStateStatus: origin.status,
        forwardObserved: Boolean(forward),
        forwardDeltaSeconds: forward ? forward.second - reference.second : null,
        forwardPersistenceObserved: forwardPersistence.observed,
        inverseObserved: Boolean(inverse),
        inverseDeltaSeconds: inverse ? inverse.second - reference.second : null,
        recoveryPersistenceObserved: recoveryPersistence.observed,
        completionDeltaSeconds: complete
          ? recoveryPersistence.confirmationSecond - reference.second
          : null,
        completeSameFamilyLifecycle: complete,
        stageSurfaceStatus: {
          preState: origin.surface,
          forward: forward?.surfaceStatus ?? "surface_unavailable",
          forwardPersistence: forwardPersistence.surface,
          inverse: inverse?.surfaceStatus ?? "surface_unavailable",
          recoveryPersistence: recoveryPersistence.surface,
        },
        failureReason: failureReason({
          origin,
          ambiguous: selected.ambiguous,
          forward,
          forwardPersistence,
          inverse,
          recoveryPersistence,
          crossed: crossedHere,
        }),
      };
    }
    const completeCount = Object.values(families).filter(
      (family) => family.completeSameFamilyLifecycle
    ).length;
    const coherent =
      completeCount >= 2 && !ambiguous && !contradiction && !crossed;
    const assignmentCount = assignments.filter(
      (row) => row.referenceKey === reference.key
    ).length;
    results.set(reference.key, {
      families,
      completeCount,
      coherent,
      ambiguous,
      contradiction,
      crossed,
      assignmentCount,
    });
  }
  return {
    results,
    assignments,
    ledger: calculateAssignmentLedger(assignments),
  };
}

function followUp(referenceSecond, nextBoundarySecond, replayEndSecond, side) {
  const candidates = [
    { value: 180, cause: "policy_cap_180" },
    {
      value: Math.max(0, replayEndSecond - referenceSecond),
      cause: "replay_end",
    },
  ];
  if (nextBoundarySecond !== null)
    candidates.push({
      value: Math.max(0, nextBoundarySecond - referenceSecond),
      cause:
        side === "anchor"
          ? "next_participant_anchor"
          : "next_real_participant_anchor",
    });
  const minimum = Math.min(...candidates.map((row) => row.value), 180);
  const causes = candidates
    .filter((row) => row.value === minimum)
    .map((row) => row.cause);
  return {
    seconds: minimum,
    cause: causes.length > 1 ? "tied_causes" : causes[0],
  };
}
export function buildSurfacePairs(anchors, controls, replayEndSecond) {
  const controlsByKey = new Map(
    controls.evidenceRows.map((row) => [row.eventCandidateKey, row])
  );
  const byParticipant = new Map();
  for (const anchor of anchors.candidates) {
    if (!byParticipant.has(anchor.participantKey))
      byParticipant.set(anchor.participantKey, []);
    byParticipant
      .get(anchor.participantKey)
      .push(anchor.normalizedElapsedSecond);
  }
  for (const rows of byParticipant.values())
    rows.sort((left, right) => left - right);
  return anchors.candidates.map((anchor) => {
    const seconds = byParticipant.get(anchor.participantKey);
    const nextAnchor =
      seconds[seconds.indexOf(anchor.normalizedElapsedSecond) + 1] ?? null;
    const control = controlsByKey.get(anchor.eventCandidateKey);
    const controlSecond = control.controlNormalizedElapsedSecond;
    const nextAfterControl =
      seconds.find((second) => second > controlSecond) ?? null;
    const anchorFollowUp = followUp(
      anchor.normalizedElapsedSecond,
      nextAnchor,
      replayEndSecond,
      "anchor"
    );
    const controlFollowUp = followUp(
      controlSecond,
      nextAfterControl,
      replayEndSecond,
      "control"
    );
    const common = Math.min(anchorFollowUp.seconds, controlFollowUp.seconds);
    return {
      anchor,
      control,
      nextAnchor,
      nextAfterControl,
      anchorFollowUp,
      controlFollowUp,
      common,
      limitingSide:
        anchorFollowUp.seconds < controlFollowUp.seconds
          ? "anchor_side"
          : controlFollowUp.seconds < anchorFollowUp.seconds
          ? "control_side"
          : "equal_horizon",
      exposureStatus:
        common === 180
          ? "fully_exposure_matched"
          : common >= 10
          ? "partially_exposure_matched"
          : "insufficient_common_follow_up",
    };
  });
}
function supportDetails(result) {
  if (!result.coherent) return { supportClass: "not_coherent", actual: false };
  const complete = FAMILIES.filter(
    (family) => result.families[family].completeSameFamilyLifecycle
  );
  const statuses = complete.flatMap((family) =>
    Object.values(result.families[family].stageSurfaceStatus)
  );
  if (statuses.includes("controller_pawn_conflict"))
    return { supportClass: "surface_conflicted", actual: false };
  if (statuses.includes("surface_unavailable"))
    return { supportClass: "surface_unresolved", actual: false };
  const surfaces = new Set(statuses.flatMap(surfacesForStatus));
  const actual = surfaces.size >= 2;
  if (surfaces.has("link_relation"))
    return { supportClass: "controller_link_surface_support", actual };
  if (surfaces.has("controller") && surfaces.has("linked_pawn"))
    return {
      supportClass:
        surfaces.size === 2
          ? "controller_and_pawn_surface_support"
          : "multiple_distinct_surfaces",
      actual: true,
    };
  if (actual)
    return { supportClass: "multiple_distinct_surfaces", actual: true };
  if (complete.includes("healthBoundary"))
    return { supportClass: "health_supported_same_surface", actual: false };
  if (
    complete.length === 2 &&
    complete.includes("booleanAlive") &&
    complete.includes("respawnBoundary")
  )
    return { supportClass: "boolean_respawn_same_surface_only", actual: false };
  return { supportClass: "surface_unresolved", actual: false };
}
function evidenceClass(row) {
  if (row.pairedCommonFollowUpSeconds < 30)
    return "insufficient_primary_horizon";
  if (row.ambiguousAssociation) return "ambiguous_lifecycle";
  if (row.contradictionObserved) return "contradictory_lifecycle";
  if (row.crossBoundaryRecoveryObserved)
    return "cross_boundary_recovery_violation";
  if (row.anchorCoherentLifecycle) return "coherent_surface_resolved_lifecycle";
  if (
    Object.values(row.anchorFamilies).some(
      (family) =>
        family.forwardObserved &&
        family.eventRelativePreStateStatus !==
          "event_relative_origin_continuous"
    )
  )
    return "event_relative_origin_inconsistent";
  if (row.anchorCompleteFamilyCount > 0)
    return "partial_surface_resolved_lifecycle";
  return "insufficient_observation";
}
function readiness(summary, technical = true) {
  const promotion =
    technical &&
    summary.operationalAssessmentLevel === "strong" &&
    summary.surfaceComposition.actualMultiSurfaceCoherentRate >= 0.5;
  return {
    eventWindowSymmetricLifecycleEvidenceAvailable: technical,
    independentlyRematchedHorizonEvidenceAvailable: technical,
    surfaceProvenanceMeasurable: technical,
    fixedCohortCompletionCurvesAvailable: technical,
    candidateLevelSurfaceResolvedLifecycleConsumptionAvailable: technical,
    readyForOperationalDeathFactPromotionReview: promotion,
    readyForFinalDeathFacts: false,
    readyForConfirmedWhoDied: false,
    readyForAttribution: false,
    readyForKillerVictim: false,
    readyForTeamfight: false,
    readyForGameplayInterpretation: false,
  };
}

function offsetDistribution(rows, cohort) {
  const familiesKey =
    cohort === "anchor" ? "anchorFamilies" : "controlFamilies";
  const offsets = [
    ["minus2", -2],
    ["minus1", -1],
    ["zero", 0],
    ["plus1", 1],
    ["plus2", 2],
  ];
  const result = {};
  for (const [key, offset] of offsets) {
    const families = rows
      .flatMap((row) => Object.values(row[familiesKey]))
      .filter((family) => family.forwardDeltaSeconds === offset);
    result[key] = {
      forwardCandidateCount: families.length,
      originContinuousRate: rate(
        families.filter(
          (family) =>
            family.eventRelativePreStateStatus ===
            "event_relative_origin_continuous"
        ).length,
        families.length
      ),
      completeLifecycleRate: rate(
        families.filter((family) => family.completeSameFamilyLifecycle).length,
        families.length
      ),
    };
  }
  result.ambiguousCandidateCount = rows.filter(
    (row) => row.ambiguousAssociation
  ).length;
  return result;
}
function countValues(rows, key, values) {
  return Object.fromEntries(
    values.map((value) => [
      value,
      rows.filter((row) => row[key] === value).length,
    ])
  );
}
function horizonResultsFromRows(rows, fixed = false) {
  return HORIZONS.map((horizonSeconds) => {
    const property = fixed
      ? "fixed180CumulativeEvidence"
      : "horizonSpecificEvidence";
    const entries = rows.map((row) =>
      row[property].find((item) => item.horizonSeconds === horizonSeconds)
    );
    const eligible = entries.filter((entry) =>
      fixed ? entry.eligibleForFixedCohort : entry.eligible
    );
    const anchor = eligible.filter(
      (entry) => entry.anchorCoherentLifecycle
    ).length;
    const control = eligible.filter(
      (entry) => entry.controlCoherentLifecycle
    ).length;
    const anchorRate = rate(anchor, eligible.length);
    const controlRate = rate(control, eligible.length);
    return {
      cohortType: fixed
        ? "fixed_180_second_cohort"
        : "horizon_specific_eligible_cohort",
      horizonSeconds,
      eligiblePairCount: eligible.length,
      anchorCoherentLifecycleRate: anchorRate,
      controlCoherentLifecycleRate: controlRate,
      pairedDifference: diff(anchorRate, controlRate),
      pairedCensoringCount: rows.length - eligible.length,
      anchorAssignmentCount: eligible.reduce(
        (sum, entry) => sum + entry.anchorAssignmentCount,
        0
      ),
      controlAssignmentCount: eligible.reduce(
        (sum, entry) => sum + entry.controlAssignmentCount,
        0
      ),
      duplicateAssignmentCount: 0,
      sourceReuseCount: eligible.reduce(
        (sum, entry) => sum + entry.sourceReuseCount,
        0
      ),
    };
  });
}
function operationalAssessment(summary) {
  const primary = summary.horizonSpecificResults.find(
    (row) => row.horizonSeconds === 30
  );
  const eligibility = rate(primary.eligiblePairCount, summary.totalAnchors);
  const problems =
    summary.contradictionCount +
    summary.ambiguityCount +
    (summary.totalAnchors - primary.eligiblePairCount);
  if (
    eligibility >= 0.9 &&
    primary.anchorCoherentLifecycleRate >= 0.7 &&
    primary.controlCoherentLifecycleRate <= 0.05 &&
    primary.pairedDifference >= 0.6 &&
    summary.sourceReuseCount === 0
  )
    return "strong";
  if (
    eligibility >= 0.8 &&
    primary.anchorCoherentLifecycleRate >= 0.3 &&
    primary.controlCoherentLifecycleRate <= 0.1 &&
    primary.pairedDifference >= 0.25 &&
    problems < summary.totalAnchors / 2
  )
    return "partial";
  return "insufficient";
}
export function summarizeSurfaceRows(rows) {
  const coherent = rows.filter((row) => row.anchorCoherentLifecycle);
  const booleanRows = coherent.filter(
    (row) => row.surfaceSupportClass === "boolean_respawn_same_surface_only"
  );
  const healthRows = coherent.filter(
    (row) => row.anchorFamilies.healthBoundary.completeSameFamilyLifecycle
  );
  const pawnRows = coherent.filter(
    (row) => row.anchorFamilies.pawnLinkPresence.completeSameFamilyLifecycle
  );
  const allStageStatuses = (row) =>
    FAMILIES.filter(
      (family) => row.anchorFamilies[family].completeSameFamilyLifecycle
    ).flatMap((family) =>
      Object.values(row.anchorFamilies[family].stageSurfaceStatus)
    );
  const horizonSpecificResults = horizonResultsFromRows(rows, false);
  const fixed180CohortCurve = horizonResultsFromRows(rows, true);
  const summary = {
    totalAnchors: rows.length,
    totalExactControls: rows.length,
    exactPairCount: rows.length,
    commonFollowUpDistribution: {
      lessThan10: rows.filter((row) => row.pairedCommonFollowUpSeconds < 10)
        .length,
      seconds10To19: rows.filter(
        (row) =>
          row.pairedCommonFollowUpSeconds >= 10 &&
          row.pairedCommonFollowUpSeconds < 20
      ).length,
      seconds20To29: rows.filter(
        (row) =>
          row.pairedCommonFollowUpSeconds >= 20 &&
          row.pairedCommonFollowUpSeconds < 30
      ).length,
      seconds30To59: rows.filter(
        (row) =>
          row.pairedCommonFollowUpSeconds >= 30 &&
          row.pairedCommonFollowUpSeconds < 60
      ).length,
      seconds60To119: rows.filter(
        (row) =>
          row.pairedCommonFollowUpSeconds >= 60 &&
          row.pairedCommonFollowUpSeconds < 120
      ).length,
      seconds120To179: rows.filter(
        (row) =>
          row.pairedCommonFollowUpSeconds >= 120 &&
          row.pairedCommonFollowUpSeconds < 180
      ).length,
      seconds180: rows.filter((row) => row.pairedCommonFollowUpSeconds === 180)
        .length,
    },
    anchorOffsetDistribution: offsetDistribution(rows, "anchor"),
    controlOffsetDistribution: offsetDistribution(rows, "control"),
    horizonSpecificResults,
    fixed180CohortCurve,
    surfaceComposition: {
      booleanRespawnOnlyCount: booleanRows.length,
      booleanRespawnOnlyRate: rate(booleanRows.length, coherent.length),
      healthSupportedCount: healthRows.length,
      healthSupportedRate: rate(healthRows.length, coherent.length),
      pawnLinkSupportedCount: pawnRows.length,
      pawnLinkSupportedRate: rate(pawnRows.length, coherent.length),
      controllerOnlyCoherentCount: coherent.filter((row) =>
        allStageStatuses(row).every((status) => status === "controller_only")
      ).length,
      linkedPawnOnlyCoherentCount: coherent.filter((row) =>
        allStageStatuses(row).every((status) => status === "linked_pawn_only")
      ).length,
      controllerAndPawnCoherentCount: coherent.filter((row) =>
        allStageStatuses(row).some(
          (status) => status === "controller_and_pawn_agree"
        )
      ).length,
      actualMultiSurfaceCoherentCount: coherent.filter(
        (row) => row.actualCrossSurfaceSupport
      ).length,
      actualMultiSurfaceCoherentRate: rate(
        coherent.filter((row) => row.actualCrossSurfaceSupport).length,
        coherent.length
      ),
      surfaceConflictCount: rows.filter((row) =>
        allStageStatuses(row).includes("controller_pawn_conflict")
      ).length,
      surfaceUnavailableCount: rows.filter((row) =>
        allStageStatuses(row).includes("surface_unavailable")
      ).length,
    },
    anchorTruncationCauses: countValues(rows, "anchorFollowUpCause", [
      "next_participant_anchor",
      "replay_end",
      "policy_cap_180",
      "tied_causes",
    ]),
    controlTruncationCauses: countValues(rows, "controlFollowUpCause", [
      "next_real_participant_anchor",
      "replay_end",
      "policy_cap_180",
      "tied_causes",
    ]),
    commonLimitingSides: countValues(rows, "commonFollowUpLimitingSide", [
      "anchor_side",
      "control_side",
      "equal_horizon",
    ]),
    crossBoundaryRecoveryCount: rows.filter(
      (row) => row.crossBoundaryRecoveryObserved
    ).length,
    contradictionCount: rows.filter((row) => row.contradictionObserved).length,
    ambiguityCount: rows.filter((row) => row.ambiguousAssociation).length,
    sourceReuseCount: horizonSpecificResults.reduce(
      (sum, row) => sum + row.sourceReuseCount,
      0
    ),
    localPrimaryHorizonCriteriaMet: false,
    operationalAssessmentLevel: "insufficient",
  };
  summary.operationalAssessmentLevel = operationalAssessment(summary);
  const primary = summary.horizonSpecificResults.find(
    (row) => row.horizonSeconds === 30
  );
  summary.localPrimaryHorizonCriteriaMet =
    rate(primary.eligiblePairCount, summary.totalAnchors) >= 0.9 &&
    primary.anchorCoherentLifecycleRate >= 0.7 &&
    primary.controlCoherentLifecycleRate <= 0.05 &&
    primary.pairedDifference >= 0.6;
  return summary;
}

function surfaceSupportFromRow(row) {
  return supportDetails({
    coherent: row.anchorCoherentLifecycle,
    families: row.anchorFamilies,
  });
}
export function validateSurfaceResolvedArtifact(
  artifact,
  schema,
  sources = null
) {
  const errors = validateJsonSchema(schema, artifact).errors.map(
    (error) => `schema:${error}`
  );
  const rows = artifact.evidenceRows ?? [];
  if (
    artifact.anchorCount !== rows.length ||
    artifact.controlCount !== rows.length ||
    artifact.exactPairCount !== rows.length ||
    artifact.evidenceRowCount !== rows.length
  )
    errors.push("artifact:count-invariant");
  if (
    new Set(rows.map((row) => row.surfaceResolvedLifecycleEvidenceKey)).size !==
    rows.length
  )
    errors.push("artifact:duplicate-evidence-key");
  const candidateMap = sources
    ? new Map(
        sources.candidates.candidates.map((row) => [row.eventCandidateKey, row])
      )
    : null;
  const controlMap = sources
    ? new Map(
        sources.controls.evidenceRows.map((row) => [row.eventCandidateKey, row])
      )
    : null;
  for (const row of rows) {
    if (
      row.pairedCommonFollowUpSeconds !==
      Math.min(
        row.anchorAvailableFollowUpSeconds,
        row.controlAvailableFollowUpSeconds
      )
    )
      errors.push(`${row.eventCandidateKey}:common-follow-up`);
    const limiting =
      row.anchorAvailableFollowUpSeconds < row.controlAvailableFollowUpSeconds
        ? "anchor_side"
        : row.controlAvailableFollowUpSeconds <
          row.anchorAvailableFollowUpSeconds
        ? "control_side"
        : "equal_horizon";
    if (row.commonFollowUpLimitingSide !== limiting)
      errors.push(`${row.eventCandidateKey}:limiting-side`);
    const exposure =
      row.pairedCommonFollowUpSeconds === 180
        ? "fully_exposure_matched"
        : row.pairedCommonFollowUpSeconds >= 10
        ? "partially_exposure_matched"
        : "insufficient_common_follow_up";
    if (row.pairExposureStatus !== exposure)
      errors.push(`${row.eventCandidateKey}:exposure-status`);
    if (
      row.anchorAvailableFollowUpSeconds < 180 &&
      row.anchorFollowUpCause === "policy_cap_180"
    )
      errors.push(`${row.eventCandidateKey}:anchor-cause`);
    if (
      row.controlAvailableFollowUpSeconds < 180 &&
      row.controlFollowUpCause === "policy_cap_180"
    )
      errors.push(`${row.eventCandidateKey}:control-cause`);
    for (const [name, families, count, coherent] of [
      [
        "anchor",
        row.anchorFamilies,
        row.anchorCompleteFamilyCount,
        row.anchorCoherentLifecycle,
      ],
      [
        "control",
        row.controlFamilies,
        row.controlCompleteFamilyCount,
        row.controlCoherentLifecycle,
      ],
    ]) {
      const actualCount = Object.values(families).filter(
        (family) => family.completeSameFamilyLifecycle
      ).length;
      if (count !== actualCount)
        errors.push(`${row.eventCandidateKey}:${name}-family-count`);
      if (
        coherent !==
        (actualCount >= 2 &&
          !row.ambiguousAssociation &&
          !row.contradictionObserved &&
          !row.crossBoundaryRecoveryObserved)
      )
        errors.push(`${row.eventCandidateKey}:${name}-coherence`);
      for (const family of Object.values(families)) {
        if (
          family.completeSameFamilyLifecycle !==
          (family.completionDeltaSeconds !== null)
        )
          errors.push(`${row.eventCandidateKey}:${name}-completion-presence`);
        if (
          family.completionDeltaSeconds !== null &&
          family.completionDeltaSeconds > 30
        )
          errors.push(`${row.eventCandidateKey}:${name}-completion-limit`);
        if (
          family.completeSameFamilyLifecycle &&
          family.eventRelativePreStateStatus !==
            "event_relative_origin_continuous"
        )
          errors.push(`${row.eventCandidateKey}:${name}-origin-completion`);
      }
    }
    const support = surfaceSupportFromRow(row);
    if (
      row.surfaceSupportClass !== support.supportClass ||
      row.actualCrossSurfaceSupport !== support.actual
    )
      errors.push(`${row.eventCandidateKey}:surface-support`);
    if (row.lifecycleEvidenceClass !== evidenceClass(row))
      errors.push(`${row.eventCandidateKey}:evidence-class`);
    if (row.finalFact !== false)
      errors.push(`${row.eventCandidateKey}:final-fact`);
    if (
      row.horizonSpecificEvidence.length !== 6 ||
      row.horizonSpecificEvidence.some(
        (entry, index) =>
          entry.horizonSeconds !== HORIZONS[index] ||
          entry.eligible !==
            row.pairedCommonFollowUpSeconds >= entry.horizonSeconds ||
          entry.sourceReuseCount !== 0
      )
    )
      errors.push(`${row.eventCandidateKey}:horizon-evidence`);
    if (
      row.fixed180CumulativeEvidence.length !== 6 ||
      row.fixed180CumulativeEvidence.some(
        (entry, index) =>
          entry.horizonSeconds !== HORIZONS[index] ||
          entry.eligibleForFixedCohort !==
            row.pairedCommonFollowUpSeconds >= 180 ||
          entry.sourceReuseCount !== 0 ||
          (!entry.eligibleForFixedCohort &&
            (entry.anchorCoherentLifecycle ||
              entry.controlCoherentLifecycle ||
              entry.anchorAssignmentCount !== 0 ||
              entry.controlAssignmentCount !== 0))
      )
    )
      errors.push(`${row.eventCandidateKey}:fixed-evidence`);
    if (candidateMap) {
      const candidate = candidateMap.get(row.eventCandidateKey);
      if (
        !candidate ||
        candidate.sourceTransitionKey !== row.sourceTransitionKey ||
        candidate.participantKey !== row.participantKey ||
        candidate.heroRefKey !== row.heroRefKey ||
        candidate.teamRefKey !== row.teamRefKey ||
        candidate.normalizedElapsedSecond !== row.anchorNormalizedElapsedSecond
      )
        errors.push(`${row.eventCandidateKey}:task183-source`);
      const control = controlMap.get(row.eventCandidateKey);
      if (
        !control ||
        control.controlNormalizedElapsedSecond !==
          row.matchedControlNormalizedElapsedSecond
      )
        errors.push(`${row.eventCandidateKey}:task186-control`);
    }
  }
  const expectedSummary = rows.length ? summarizeSurfaceRows(rows) : null;
  if (
    expectedSummary &&
    JSON.stringify(artifact.summary) !== JSON.stringify(expectedSummary)
  )
    errors.push("artifact:summary-reproduction");
  if (
    expectedSummary &&
    Object.values(expectedSummary.commonFollowUpDistribution).reduce(
      (sum, value) => sum + value,
      0
    ) !== rows.length
  )
    errors.push("artifact:distribution-sum");
  if (
    expectedSummary &&
    JSON.stringify(artifact.readiness) !==
      JSON.stringify(readiness(expectedSummary, true))
  )
    errors.push("artifact:readiness");
  return errors;
}

function referencesForPairs(pairs, cohort, horizon) {
  return pairs
    .filter((pair) => pair.common >= horizon)
    .map((pair) => ({
      key: pair.anchor.eventCandidateKey,
      participantKey: pair.anchor.participantKey,
      second:
        cohort === "anchor"
          ? pair.anchor.normalizedElapsedSecond
          : pair.control.controlNormalizedElapsedSecond,
      naturalBoundarySecond:
        cohort === "anchor" ? pair.nextAnchor : pair.nextAfterControl,
    }));
}
export function createSurfaceResolvedArtifact({
  replayId,
  sources,
  mapped,
  replayEndSecond,
}) {
  const pairs = buildSurfacePairs(
    sources.candidates,
    sources.controls,
    replayEndSecond
  );
  const horizonRuns = new Map();
  for (const horizon of HORIZONS) {
    const anchor = analyzeSurfaceCohort(
      referencesForPairs(pairs, "anchor", horizon),
      mapped,
      "anchor",
      horizon
    );
    const control = analyzeSurfaceCohort(
      referencesForPairs(pairs, "control", horizon),
      mapped,
      "control",
      horizon
    );
    horizonRuns.set(horizon, { anchor, control });
  }
  const fixedRuns = new Map();
  const fixedPairs = pairs.filter((pair) => pair.common >= 180);
  for (const horizon of HORIZONS)
    fixedRuns.set(horizon, {
      anchor: analyzeSurfaceCohort(
        referencesForPairs(fixedPairs, "anchor", 180),
        mapped,
        "fixed_anchor",
        horizon
      ),
      control: analyzeSurfaceCohort(
        referencesForPairs(fixedPairs, "control", 180),
        mapped,
        "fixed_control",
        horizon
      ),
    });
  const primary = horizonRuns.get(30);
  const rows = pairs.map((pair, index) => {
    const eligible = pair.common >= 30;
    const anchor = eligible
      ? primary.anchor.results.get(pair.anchor.eventCandidateKey)
      : {
          families: Object.fromEntries(
            FAMILIES.map((family) => [
              family,
              emptyFamily("forward_not_observed"),
            ])
          ),
          completeCount: 0,
          coherent: false,
          ambiguous: false,
          contradiction: false,
          crossed: false,
          assignmentCount: 0,
        };
    const control = eligible
      ? primary.control.results.get(pair.anchor.eventCandidateKey)
      : {
          families: Object.fromEntries(
            FAMILIES.map((family) => [
              family,
              emptyFamily("forward_not_observed"),
            ])
          ),
          completeCount: 0,
          coherent: false,
          ambiguous: false,
          contradiction: false,
          crossed: false,
          assignmentCount: 0,
        };
    const support = supportDetails(anchor);
    const horizonSpecificEvidence = HORIZONS.map((horizonSeconds) => {
      const run = horizonRuns.get(horizonSeconds);
      const isEligible = pair.common >= horizonSeconds;
      const a = isEligible
        ? run.anchor.results.get(pair.anchor.eventCandidateKey)
        : null;
      const c = isEligible
        ? run.control.results.get(pair.anchor.eventCandidateKey)
        : null;
      return {
        horizonSeconds,
        eligible: isEligible,
        anchorCoherentLifecycle: a?.coherent ?? false,
        controlCoherentLifecycle: c?.coherent ?? false,
        anchorAssignmentCount: a?.assignmentCount ?? 0,
        controlAssignmentCount: c?.assignmentCount ?? 0,
        sourceReuseCount: 0,
      };
    });
    const fixed180CumulativeEvidence = HORIZONS.map((horizonSeconds) => {
      const fixedEligible = pair.common >= 180;
      const run = fixedRuns.get(horizonSeconds);
      const fixedAnchor = fixedEligible
        ? run.anchor.results.get(pair.anchor.eventCandidateKey)
        : null;
      const fixedControl = fixedEligible
        ? run.control.results.get(pair.anchor.eventCandidateKey)
        : null;
      return {
        horizonSeconds,
        eligibleForFixedCohort: fixedEligible,
        anchorCoherentLifecycle: fixedAnchor?.coherent ?? false,
        controlCoherentLifecycle: fixedControl?.coherent ?? false,
        anchorAssignmentCount: fixedAnchor?.assignmentCount ?? 0,
        controlAssignmentCount: fixedControl?.assignmentCount ?? 0,
        sourceReuseCount: 0,
      };
    });
    const row = {
      surfaceResolvedLifecycleEvidenceKey: `surface_resolved_lifecycle_${six(
        index + 1
      )}`,
      eventCandidateKey: pair.anchor.eventCandidateKey,
      sourceTransitionKey: pair.anchor.sourceTransitionKey,
      participantKey: pair.anchor.participantKey,
      heroRefKey: pair.anchor.heroRefKey,
      teamRefKey: pair.anchor.teamRefKey,
      anchorNormalizedElapsedSecond: pair.anchor.normalizedElapsedSecond,
      matchedControlNormalizedElapsedSecond:
        pair.control.controlNormalizedElapsedSecond,
      anchorAvailableFollowUpSeconds: pair.anchorFollowUp.seconds,
      controlAvailableFollowUpSeconds: pair.controlFollowUp.seconds,
      pairedCommonFollowUpSeconds: pair.common,
      anchorFollowUpCause: pair.anchorFollowUp.cause,
      controlFollowUpCause: pair.controlFollowUp.cause,
      commonFollowUpLimitingSide: pair.limitingSide,
      pairExposureStatus: pair.exposureStatus,
      anchorFamilies: anchor.families,
      controlFamilies: control.families,
      anchorCompleteFamilyCount: anchor.completeCount,
      controlCompleteFamilyCount: control.completeCount,
      anchorCoherentLifecycle: anchor.coherent,
      controlCoherentLifecycle: control.coherent,
      surfaceSupportClass: support.supportClass,
      actualCrossSurfaceSupport: support.actual,
      crossBoundaryRecoveryObserved: anchor.crossed || control.crossed,
      contradictionObserved: anchor.contradiction || control.contradiction,
      ambiguousAssociation: anchor.ambiguous || control.ambiguous,
      lifecycleEvidenceClass: "",
      horizonSpecificEvidence,
      fixed180CumulativeEvidence,
      semanticStatus: "unconfirmed_surface_resolved_lifecycle",
      finalFact: false,
    };
    row.lifecycleEvidenceClass = evidenceClass(row);
    return row;
  });
  const summary = summarizeSurfaceRows(rows);
  const artifact = {
    schemaVersion: 1,
    replayId,
    artifactClass: "death_event_surface_resolved_lifecycle_evidence",
    generatedBy:
      "tools/emit-death-event-surface-resolved-lifecycle-evidence.mjs",
    generatedAt: "task_190",
    rawDataCaptured: false,
    rawFieldNamesIncludedInRows: false,
    rawIdsIncluded: false,
    rawTicksIncluded: false,
    rawTimestampsIncluded: false,
    finalFactsProduced: false,
    attributionEmitted: false,
    anchorCount: rows.length,
    controlCount: rows.length,
    exactPairCount: rows.length,
    evidenceRowCount: rows.length,
    evidenceRows: rows,
    summary,
    readiness: readiness(summary, true),
    limitations: [
      "Surface-resolved lifecycle evidence is operational candidate evidence only.",
      "Task 186 controls are reused exactly; every horizon is independently rematched.",
      "No final death fact, attribution, identity, or gameplay interpretation is emitted.",
    ],
  };
  const assignments = [...horizonRuns.values(), ...fixedRuns.values()].flatMap(
    (run) => [...run.anchor.assignments, ...run.control.assignments]
  );
  const ledger = calculateAssignmentLedger(assignments);
  return {
    artifact,
    ledger,
    horizonRuns,
    fixedRuns,
    audit: {
      mappingFailures: mapped.failures,
      provenanceFailures: 0,
      bridgeFailures: 0,
    },
  };
}

function replayPath(id) {
  if (["replay_001", "replay_002", "replay_003", "replay_004"].includes(id))
    return `samples/partida_${id.slice(-3)}.dem`;
  if (id === "replay_009") return "samples/replay_009_normal.dem";
  return `.local/deadem/replays/inbox/partida_${id.slice(-3)}.dem`;
}
function validateIntegrityGate(gate) {
  if (
    gate?.gate !== "task189_lifecycle_integrity_repaired" ||
    gate.technicalGateStatus !== "passed" ||
    gate.replayPathResolved !== false ||
    gate.playerConstructed !== false ||
    gate.createReadStreamCalled !== false
  )
    throw new Error("Task 189 lifecycle-integrity gate required");
}
export async function prepareSurfaceResolvedRun({
  manifest,
  loadIntegrityGate,
  loadPilotGate,
  sourceLoader,
  onReplayPathResolution = () => {},
}) {
  validateExactManifest(manifest);
  validateIntegrityGate(await loadIntegrityGate());
  if (manifest.runKind === "task190-bounded32")
    validateExactPilotGate(await loadPilotGate());
  const validated = await validateManifestSourcesBeforeReplay(
    manifest,
    sourceLoader
  );
  return validated.map((row) => {
    onReplayPathResolution(row.replayId);
    return {
      replayId: row.replayId,
      sources: row.sources,
      absolutePath: path.resolve(ROOT, replayPath(row.replayId)),
    };
  });
}
async function runReplay(
  input,
  schema,
  playerFactory = () => new Player(undefined, Logger.NOOP),
  streamFactory = createReadStream
) {
  const summary = {
    replayId: input.replayId,
    parseCompleted: false,
    status: "not_started",
    errorMessage: null,
  };
  let player;
  try {
    player = playerFactory();
    const aggregate = { seeds: new Set(), samples: new Map() };
    await player.load(streamFactory(input.absolutePath));
    const first = safeNumber(player.getFirstTick()) ?? 0;
    const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 30;
    let next = first;
    let replayEndSecond = 0;
    while (true) {
      const tick = safeNumber(player.getCurrentTick());
      if (tick !== null)
        replayEndSecond = Math.max(
          0,
          Math.round((tick - first) / Math.max(1, tickRate))
        );
      if (tick !== null && tick >= next) {
        observe(player, aggregate, replayEndSecond);
        next = tick + Math.max(1, Math.round(tickRate));
      }
      if (!(await player.nextTick())) {
        summary.parseCompleted = true;
        break;
      }
    }
    const mapped = mapObserved(aggregate, input.sources.identity);
    const created = createSurfaceResolvedArtifact({
      replayId: input.replayId,
      sources: input.sources,
      mapped,
      replayEndSecond,
    });
    const errors = validateSurfaceResolvedArtifact(
      created.artifact,
      schema,
      input.sources
    );
    summary.status = errors.length ? "blocked" : "emitted";
    summary.errorMessage = errors.join("; ") || null;
    summary.anchorCount = created.artifact.anchorCount;
    summary.mappingStatus = mapped.status;
    summary.schemaStatus = errors.some((error) => error.startsWith("schema:"))
      ? "failed"
      : "passed";
    summary.invariantStatus = errors.length ? "failed" : "passed";
    return { summary, ...created, errors };
  } catch (error) {
    summary.status = "blocked";
    summary.errorMessage = String(error?.message ?? error);
    return {
      summary,
      artifact: null,
      ledger: null,
      errors: [summary.errorMessage],
      audit: null,
    };
  } finally {
    await player?.dispose?.().catch(() => {});
  }
}

function forbiddenPaths(value, at = "$", found = []) {
  if (Array.isArray(value)) {
    value.forEach((row, index) =>
      forbiddenPaths(row, `${at}[${index}]`, found)
    );
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const forbidden =
    /^(killer|victim|assist|handle|rawValue|rawFieldName|rawId|rawTick|rawTimestamp|position|damage|objective)$/u;
  for (const [key, row] of Object.entries(value)) {
    if (forbidden.test(key)) found.push(`${at}.${key}`);
    forbiddenPaths(row, `${at}.${key}`, found);
  }
  return found;
}
function combinedSummary(artifacts) {
  return summarizeSurfaceRows(
    artifacts.flatMap((artifact) => artifact.evidenceRows)
  );
}
function aggregateAssessment(summary, localStrongCount, technical) {
  const primary = summary.horizonSpecificResults.find(
    (row) => row.horizonSeconds === 30
  );
  const eligibility = rate(primary.eligiblePairCount, summary.totalAnchors);
  if (
    technical &&
    summary.totalAnchors === 2552 &&
    eligibility >= 0.9 &&
    primary.anchorCoherentLifecycleRate >= 0.7 &&
    primary.controlCoherentLifecycleRate <= 0.05 &&
    primary.pairedDifference >= 0.6 &&
    localStrongCount >= 30 &&
    summary.sourceReuseCount === 0
  )
    return "strong";
  const problems =
    summary.contradictionCount +
    summary.ambiguityCount +
    (summary.totalAnchors - primary.eligiblePairCount);
  if (
    eligibility >= 0.8 &&
    primary.anchorCoherentLifecycleRate >= 0.3 &&
    primary.controlCoherentLifecycleRate <= 0.1 &&
    primary.pairedDifference >= 0.25 &&
    problems < summary.totalAnchors / 2
  )
    return "partial";
  return "insufficient";
}
function perParticipant(artifacts) {
  const groups = new Map();
  for (const artifact of artifacts)
    for (const row of artifact.evidenceRows) {
      const key = `${artifact.replayId}\0${row.participantKey}`;
      if (!groups.has(key))
        groups.set(key, {
          replayId: artifact.replayId,
          participantKey: row.participantKey,
          rows: [],
        });
      groups.get(key).rows.push(row);
    }
  return [...groups.values()].map((group) => ({
    replayId: group.replayId,
    participantKey: group.participantKey,
    ...summarizeSurfaceRows(group.rows),
  }));
}
function blockedFiles(manifest, results, reason) {
  return [
    {
      relativePath: "blocked-gate.json",
      value: audit(
        {
          gate: "task189_corrected_surface_resolved_lifecycle_blocked",
          technicalGateStatus: "blocked",
          reason,
        },
        { integrity: false, measurementCompleted: false }
      ),
    },
    {
      relativePath: "blocked-summary.json",
      value: audit(
        {
          successfulArtifactsPublished: 0,
          previousActiveDirectoryPreserved: true,
        },
        { integrity: false, measurementCompleted: false }
      ),
    },
    {
      relativePath: "failure-audits.json",
      value: audit(
        { rows: results.map((result) => result.summary), artifactPaths: [] },
        { integrity: false, measurementCompleted: false }
      ),
    },
  ];
}
function buildTask189Correction(results, summary) {
  const currentRows = results.flatMap((result) =>
    result.artifact.evidenceRows.map((row) => ({
      replayId: result.artifact.replayId,
      row,
    }))
  );
  const historicalRows = [];
  for (const result of results) {
    const priorMap = new Map(
      result.sources.historical.evidenceRows.map((row) => [
        row.eventCandidateKey,
        row,
      ])
    );
    for (const row of result.artifact.evidenceRows)
      historicalRows.push({
        replayId: result.artifact.replayId,
        prior: priorMap.get(row.eventCandidateKey),
        row,
      });
  }
  const historicalCoherent = (prior, side, horizonSeconds) => {
    if (!prior || prior.pairedCommonFollowUpSeconds < horizonSeconds)
      return false;
    const familyCount = Object.values(prior[`${side}Families`]).filter(
      (family) =>
        family.completionDeltaSeconds !== null &&
        family.completionDeltaSeconds <= horizonSeconds
    ).length;
    if (familyCount < 2) return false;
    return side === "control"
      ? true
      : !prior.ambiguousAssociation &&
          !prior.contradictionObserved &&
          !prior.crossAnchorRecoveryObserved;
  };
  const correctedCoherent = (row, side, horizonSeconds) =>
    row.horizonSpecificEvidence.find(
      (entry) => entry.horizonSeconds === horizonSeconds
    )?.[`${side}CoherentLifecycle`] ?? false;
  const oldHorizonResults = HORIZONS.map((horizonSeconds) => {
    const eligible = historicalRows.filter(
      ({ prior }) => prior.pairedCommonFollowUpSeconds >= horizonSeconds
    );
    const anchorRate = rate(
      eligible.filter(({ prior }) =>
        historicalCoherent(prior, "anchor", horizonSeconds)
      ).length,
      eligible.length
    );
    const controlRate = rate(
      eligible.filter(({ prior }) =>
        historicalCoherent(prior, "control", horizonSeconds)
      ).length,
      eligible.length
    );
    return {
      horizonSeconds,
      eligiblePairCount: eligible.length,
      anchorCoherentLifecycleRate: anchorRate,
      controlCoherentLifecycleRate: controlRate,
      pairedDifference: diff(anchorRate, controlRate),
    };
  });
  const horizonRateChanges = oldHorizonResults.map((previous) => {
    const corrected = summary.horizonSpecificResults.find(
      (row) => row.horizonSeconds === previous.horizonSeconds
    );
    return {
      horizonSeconds: previous.horizonSeconds,
      eligiblePairCount: corrected.eligiblePairCount,
      previousAnchorRate: previous.anchorCoherentLifecycleRate,
      correctedAnchorRate: corrected.anchorCoherentLifecycleRate,
      anchorRateChange: diff(
        corrected.anchorCoherentLifecycleRate,
        previous.anchorCoherentLifecycleRate
      ),
      previousControlRate: previous.controlCoherentLifecycleRate,
      correctedControlRate: corrected.controlCoherentLifecycleRate,
      controlRateChange: diff(
        corrected.controlCoherentLifecycleRate,
        previous.controlCoherentLifecycleRate
      ),
      previousPairedDifference: previous.pairedDifference,
      correctedPairedDifference: corrected.pairedDifference,
      pairedDifferenceChange: diff(
        corrected.pairedDifference,
        previous.pairedDifference
      ),
    };
  });
  const changes = historicalRows.filter(
    ({ prior, row }) =>
      HORIZONS.some(
        (horizonSeconds) =>
          historicalCoherent(prior, "anchor", horizonSeconds) !==
            correctedCoherent(row, "anchor", horizonSeconds) ||
          historicalCoherent(prior, "control", horizonSeconds) !==
            correctedCoherent(row, "control", horizonSeconds)
      ) ||
      FAMILIES.some(
        (family) =>
          (prior.anchorFamilies[family].preStateContinuityStatus ===
            "stable_matching_forward_origin") !==
          (row.anchorFamilies[family].eventRelativePreStateStatus ===
            "event_relative_origin_continuous")
      )
  );
  const primaryChange = horizonRateChanges.find(
    (row) => row.horizonSeconds === 30
  );
  return audit(
    {
      historicalTask189ArtifactsModified: false,
      totalRows: currentRows.length,
      rowsChangedByEventRelativePreState: changes.length,
      anchorsRecoveredAtNegativeOffsets: currentRows.filter(
        ({ row }) =>
          row.anchorCoherentLifecycle &&
          Object.values(row.anchorFamilies).some(
            (family) =>
              family.completeSameFamilyLifecycle &&
              family.forwardDeltaSeconds < 0
          )
      ).length,
      controlsRecoveredAtNegativeOffsets: currentRows.filter(
        ({ row }) =>
          row.controlCoherentLifecycle &&
          Object.values(row.controlFamilies).some(
            (family) =>
              family.completeSameFamilyLifecycle &&
              family.forwardDeltaSeconds < 0
          )
      ).length,
      rowsInvalidated: historicalRows.filter(
        ({ prior, row }) =>
          historicalCoherent(prior, "anchor", 30) &&
          !correctedCoherent(row, "anchor", 30)
      ).length,
      previousPrimaryAnchorRate: primaryChange.previousAnchorRate,
      correctedPrimaryAnchorRate: primaryChange.correctedAnchorRate,
      previousPrimaryControlRate: primaryChange.previousControlRate,
      correctedPrimaryControlRate: primaryChange.correctedControlRate,
      horizonRateChanges,
      correctedAssessment: summary.operationalAssessmentLevel,
      affectedRows: changes.map(({ replayId, row }) => ({
        replayId,
        eventCandidateKey: row.eventCandidateKey,
      })),
    },
    {
      operational: summary.operationalAssessmentLevel === "strong",
      promotion:
        summary.surfaceComposition.actualMultiSurfaceCoherentRate >= 0.5,
    }
  );
}

function buildSuccess(manifest, plan, results, schema) {
  const artifacts = results.map((result) => result.artifact);
  let summary = combinedSummary(artifacts);
  const expected = EXPECTED.get(manifest.runKind);
  const perReplay = results.map((result) => ({
    replayId: result.artifact.replayId,
    parserStatus: result.summary.parseCompleted ? "completed" : "failed",
    mappingStatus: result.summary.mappingStatus,
    ...result.artifact.summary,
  }));
  const localStrongCount = perReplay.filter(
    (row) => row.localPrimaryHorizonCriteriaMet
  ).length;
  const requirements = {
    parserCompletion: results.every((result) => result.summary.parseCompleted),
    exactCounts:
      summary.totalAnchors === expected &&
      summary.totalExactControls === expected &&
      summary.exactPairCount === expected,
    participantMappingFailuresZero: results.every(
      (result) => result.audit.mappingFailures === 0
    ),
    provenanceFailuresZero: results.every(
      (result) => result.audit.provenanceFailures === 0
    ),
    bridgeFailuresZero: results.every(
      (result) => result.audit.bridgeFailures === 0
    ),
    invariantFailuresZero: results.every(
      (result) => result.errors.length === 0
    ),
    horizonReuseZero: results.every(
      (result) => result.ledger.sourceReuseCount === 0
    ),
    protectedReplayAccessZero: plan.every(
      (row) => !FORBIDDEN.has(row.replayId)
    ),
    outputPolicyFailuresZero: artifacts.every(
      (artifact) => forbiddenPaths(artifact).length === 0
    ),
    finalFactsAndAttributionZero: artifacts.every(
      (artifact) => !artifact.finalFactsProduced && !artifact.attributionEmitted
    ),
    allOrNothingGatePassed: true,
  };
  const technicalBeforeSize = Object.values(requirements).every(Boolean);
  summary.operationalAssessmentLevel = aggregateAssessment(
    summary,
    localStrongCount,
    technicalBeforeSize
  );
  const surfaceMet =
    summary.surfaceComposition.actualMultiSurfaceCoherentRate >= 0.5;
  const operationalMet = summary.operationalAssessmentLevel === "strong";
  const prefix =
    manifest.runKind === "task190-pilot"
      ? "surface-resolved-lifecycle-pilot"
      : "surface-resolved-lifecycle-bounded32";
  const files = artifacts.map((artifact) => ({
    relativePath: `artifacts/${artifact.replayId}/death_event_surface_resolved_lifecycle_evidence.json`,
    value: artifact,
  }));
  const audits = [
    ["source-provenance-audit", { failures: 0 }, true, null, null],
    [
      "task183-task186-bridge-audit",
      {
        anchors: summary.totalAnchors,
        exactControls: summary.totalExactControls,
        failures: 0,
      },
      true,
      null,
      null,
    ],
    [
      "event-window-association-audit",
      {
        minimumDeltaSeconds: -2,
        maximumDeltaSeconds: 2,
        nearestUniqueCandidateRequired: true,
        equidistantCandidatesRemainAmbiguous: true,
        anchorOffsetDistribution: summary.anchorOffsetDistribution,
        controlOffsetDistribution: summary.controlOffsetDistribution,
      },
      true,
      operationalMet,
      null,
    ],
    [
      "event-relative-pre-state-audit",
      {
        anchorOffsetDistribution: summary.anchorOffsetDistribution,
        controlOffsetDistribution: summary.controlOffsetDistribution,
      },
      true,
      operationalMet,
      null,
    ],
    [
      "independent-horizon-rematching-audit",
      { horizonResults: summary.horizonSpecificResults },
      requirements.horizonReuseZero,
      operationalMet,
      null,
    ],
    [
      "fixed-180-cohort-curve-audit",
      { curve: summary.fixed180CohortCurve },
      true,
      null,
      null,
    ],
    [
      "surface-provenance-audit",
      summary.surfaceComposition,
      true,
      null,
      surfaceMet,
    ],
    [
      "truncation-cause-audit",
      {
        anchor: summary.anchorTruncationCauses,
        control: summary.controlTruncationCauses,
        limitingSides: summary.commonLimitingSides,
      },
      true,
      null,
      null,
    ],
    [
      "draft-2020-12-schema-validation-audit",
      {
        validator: "Ajv Draft 2020-12",
        artifactsValidated: artifacts.length,
        schemaFailures: results.reduce(
          (sum, result) =>
            sum +
            result.errors.filter((error) => error.startsWith("schema:")).length,
          0
        ),
      },
      results.every(
        (result) => !result.errors.some((error) => error.startsWith("schema:"))
      ),
      null,
      null,
    ],
    [
      "artifact-invariant-validation-audit",
      {
        validator: "Ajv Draft 2020-12 plus Task 190 semantic invariants",
        failures: results.reduce(
          (sum, result) => sum + result.errors.length,
          0
        ),
      },
      requirements.invariantFailuresZero,
      null,
      null,
    ],
    [
      "assignment-ledger-audit",
      {
        horizonSourceReuseCount: summary.sourceReuseCount,
        perReplay: results.map((result) => ({
          replayId: result.artifact.replayId,
          totalAssignments: result.ledger.totalAssignments,
          duplicateAssignmentCount: result.ledger.duplicateAssignmentCount,
          sourceReuseCount: result.ledger.sourceReuseCount,
        })),
      },
      requirements.horizonReuseZero,
      null,
      null,
    ],
    [
      "output-policy-audit",
      {
        finalFacts: 0,
        attribution: 0,
        failures: requirements.outputPolicyFailuresZero ? 0 : 1,
      },
      requirements.outputPolicyFailuresZero,
      null,
      null,
    ],
    [
      "replay-protection-audit",
      {
        replay005To008Accessed: false,
        processedReplayIds: plan.map((row) => row.replayId),
      },
      requirements.protectedReplayAccessZero,
      null,
      null,
    ],
    [
      "parser-completion-audit",
      { rows: results.map((result) => result.summary) },
      requirements.parserCompletion,
      null,
      null,
    ],
    ["per-replay-audit", { rows: perReplay }, true, null, null],
    [
      "operational-assessment-audit",
      {
        primaryHorizonSeconds: 30,
        primaryResult: summary.horizonSpecificResults.find(
          (row) => row.horizonSeconds === 30
        ),
        eligibilityRate: rate(
          summary.horizonSpecificResults.find(
            (row) => row.horizonSeconds === 30
          ).eligiblePairCount,
          summary.totalAnchors
        ),
        localStrongReplayCount: localStrongCount,
        operationalAssessmentLevel: summary.operationalAssessmentLevel,
      },
      true,
      operationalMet,
      surfaceMet,
    ],
    [
      "all-or-nothing-audit",
      { failedRunArtifacts: 0, previousActiveDirectoryByteIdentical: true },
      true,
      null,
      null,
    ],
  ];
  files.push(
    { relativePath: `${prefix}-manifest.json`, value: manifest },
    ...audits.map(([name, value, integrity, operational, promotion]) => ({
      relativePath: `${prefix}-${name}.json`,
      value: audit(value, { integrity, operational, promotion }),
    })),
    {
      relativePath: `${prefix}-summary.json`,
      value: audit(
        { summary, localStrongReplayCount: localStrongCount },
        { operational: operationalMet, promotion: surfaceMet }
      ),
    },
    {
      relativePath: `${prefix}-question-readiness.json`,
      value: { schemaVersion: 1, ...readiness(summary, technicalBeforeSize) },
    },
    {
      relativePath: "run-index.json",
      value: {
        schemaVersion: 1,
        runKind: manifest.runKind,
        replayIds: manifest.replayIds,
        primaryOperationalHorizonSeconds: 30,
        independentlyRematchedHorizons: HORIZONS,
      },
    }
  );
  if (manifest.runKind === "task190-bounded32")
    files.push({
      relativePath: "surface-resolved-bounded32-per-participant-audit.json",
      value: audit({ rows: perParticipant(artifacts) }),
    });
  const artifactSizes = artifacts.map((artifact) => ({
    replayId: artifact.replayId,
    bytes: bytes(artifact),
  }));
  let runBytes = files.reduce((sum, file) => sum + bytes(file.value), 0);
  let sizePassed =
    artifactSizes.every((row) => row.bytes <= MAX_ARTIFACT) &&
    runBytes <= MAX_RUN;
  let technical = technicalBeforeSize && sizePassed;
  const gateName =
    manifest.runKind === "task190-pilot"
      ? "surface_resolved_lifecycle_pilot_ready"
      : "task189_corrected_surface_resolved_lifecycle_bounded32_ready";
  const gate = audit(
    {
      gate: technical
        ? gateName
        : "task189_corrected_surface_resolved_lifecycle_blocked",
      technicalGateStatus: technical ? "passed" : "blocked",
      operationalAssessmentLevel: summary.operationalAssessmentLevel,
      operationalAssessmentThresholdStatus: operationalMet ? "met" : "not_met",
      surfaceSupportThresholdStatus: surfaceMet ? "met" : "not_met",
      manifestIdentity: manifest.manifestIdentity,
      replayIds: manifest.replayIds,
      parserCompleted: results.filter((result) => result.summary.parseCompleted)
        .length,
      parserExpected: manifest.replayIds.length,
      anchorCount: summary.totalAnchors,
      controlCount: summary.totalExactControls,
      exactPairCount: summary.exactPairCount,
      evidenceRowCount: summary.totalAnchors,
      eventRelativePreStateEmitted: true,
      offsetDistributionEmitted: true,
      independentlyRematchedHorizonCount: 6,
      fixed180CohortCurveEmitted: true,
      surfaceProvenanceEmitted: true,
      artifactInvariantFailures: results.reduce(
        (sum, result) => sum + result.errors.length,
        0
      ),
      horizonSourceReuseCount: summary.sourceReuseCount,
      participantMappingFailures: 0,
      provenanceFailures: 0,
      bridgeFailures: 0,
      schemaFailures: results.reduce(
        (sum, result) =>
          sum +
          result.errors.filter((error) => error.startsWith("schema:")).length,
        0
      ),
      outputPolicyFailures: requirements.outputPolicyFailuresZero ? 0 : 1,
      protectedReplayAccessCount: 0,
      finalFacts: 0,
      attribution: 0,
      sizeGatePassed: sizePassed,
      allOrNothingGatePassed: true,
    },
    {
      integrity: technical,
      measurementCompleted: technical,
      operational: operationalMet,
      promotion: surfaceMet,
    }
  );
  files.push({ relativePath: `${prefix}-gate.json`, value: gate });
  runBytes = files.reduce((sum, file) => sum + bytes(file.value), 0);
  sizePassed =
    artifactSizes.every((row) => row.bytes <= MAX_ARTIFACT) &&
    runBytes <= MAX_RUN;
  technical = technicalBeforeSize && sizePassed;
  gate.gate = technical
    ? gateName
    : "task189_corrected_surface_resolved_lifecycle_blocked";
  gate.technicalGateStatus = technical ? "passed" : "blocked";
  gate.sizeGatePassed = sizePassed;
  gate.integrityStatus = technical ? "passed" : "failed";
  gate.measurementStatus = technical ? "completed" : "blocked";
  files.push({
    relativePath: `${prefix}-artifact-and-total-run-size-audit.json`,
    value: audit(
      {
        maximumArtifactBytes: MAX_ARTIFACT,
        maximumRunBytes: MAX_RUN,
        totalRunBytes: runBytes,
        sizeAuditFileExcludedFromSelfMeasurement: true,
        artifacts: artifactSizes,
      },
      { integrity: sizePassed }
    ),
  });
  return {
    files,
    gate,
    summary,
    technical,
    localStrongCount,
    correctionAudit: buildTask189Correction(results, summary),
  };
}

async function finalize(built) {
  const ready = readiness(built.summary, built.technical);
  const operationalMet = built.summary.operationalAssessmentLevel === "strong";
  const surfaceMet =
    built.summary.surfaceComposition.actualMultiSurfaceCoherentRate >= 0.5;
  await writeJson(`${OUTPUT}task190-question-readiness.json`, {
    schemaVersion: 1,
    ...ready,
  });
  await writeJson(
    `${OUTPUT}task190-summary.json`,
    audit(
      {
        gate: built.gate.gate,
        summary: built.summary,
        localStrongReplayCount: built.localStrongCount,
        finalFacts: 0,
        attribution: 0,
      },
      { operational: operationalMet, promotion: surfaceMet }
    )
  );
  await writeJson(`${OUTPUT}task190-gate.json`, built.gate);
  await writeJson(
    `${OUTPUT}death-event-surface-resolved-lifecycle-consumption-contract.json`,
    {
      schemaVersion: 1,
      activeBaseline:
        "death_event_surface_resolved_lifecycle_evidence_bounded32_task190",
      historicalBaselinesRetained: [
        "death_event_semantic_sequence_evidence_bounded32_task187",
        "death_event_segmented_lifecycle_evidence_bounded32_task188",
        "death_event_exposure_matched_lifecycle_evidence_bounded32_task189",
      ],
      supersedesTask189OnlyFor: [
        "event_relative_pre_state_continuity",
        "independently_rematched_horizons",
        "actual_surface_provenance",
        "corrected_truncation_accounting",
        "corrected_audit_semantics",
        "promotion_readiness",
      ],
      finalFactsAvailable: false,
      attributionAvailable: false,
    }
  );
  await writeJson(
    `${OUTPUT}integrity/task189-event-relative-correction-audit.json`,
    built.correctionAudit
  );
}
export async function executePreparedSurfaceRun({
  manifest,
  plan,
  replayExecutor,
  activeRoot,
  blockedRoot,
}) {
  const results = [];
  for (const input of plan) results.push(await replayExecutor(input));
  const failed = results.some(
    (result) => !result.artifact || result.summary?.status !== "emitted"
  );
  if (failed) {
    const reason = results
      .filter(
        (result) => !result.artifact || result.summary?.status !== "emitted"
      )
      .map((result) => result.summary?.errorMessage ?? "failed replay")
      .join("; ");
    await publishRunOutcome({
      activeRoot,
      blockedRoot,
      success: false,
      files: blockedFiles(manifest, results, reason),
    });
    return { status: "blocked", results };
  }
  return { status: "ready_for_success_publication", results };
}
export async function runSurfaceResolvedLifecycleEmission({
  manifest,
  summaryOutput,
  replayExecutor,
  sourceLoader,
}) {
  const expectedRoot = `${OUTPUT}${manifest.runKind}/`;
  if (`${summaryOutput.replace(/\/?$/u, "")}/` !== expectedRoot)
    throw new Error("invalid summary output");
  const activeRoot = path.resolve(ROOT, expectedRoot);
  const blockedRoot = path.resolve(
    ROOT,
    `${OUTPUT}${manifest.runKind}-blocked`
  );
  const schema = await readJson(SCHEMA_PATH);
  let plan;
  try {
    plan = await prepareSurfaceResolvedRun({
      manifest,
      loadIntegrityGate: () => readJson(INTEGRITY_GATE),
      loadPilotGate: () =>
        readJson(
          `${OUTPUT}task190-pilot/surface-resolved-lifecycle-pilot-gate.json`
        ),
      sourceLoader,
    });
  } catch (error) {
    await publishRunOutcome({
      activeRoot,
      blockedRoot,
      success: false,
      files: blockedFiles(manifest, [], String(error.message)),
    });
    throw error;
  }
  const prepared = await executePreparedSurfaceRun({
    manifest,
    plan,
    replayExecutor: replayExecutor ?? ((input) => runReplay(input, schema)),
    activeRoot,
    blockedRoot,
  });
  if (prepared.status === "blocked")
    throw new Error(`${manifest.runKind} blocked`);
  for (const result of prepared.results) {
    result.sources = plan.find(
      (row) => row.replayId === result.artifact.replayId
    ).sources;
  }
  const built = buildSuccess(manifest, plan, prepared.results, schema);
  if (!built.technical) {
    await publishRunOutcome({
      activeRoot,
      blockedRoot,
      success: false,
      files: blockedFiles(manifest, prepared.results, built.gate.gate),
    });
    throw new Error(built.gate.gate);
  }
  await publishRunOutcome({
    activeRoot,
    blockedRoot,
    success: true,
    files: built.files,
  });
  await rm(blockedRoot, { recursive: true, force: true });
  if (manifest.runKind === "task190-bounded32") await finalize(built);
  return built;
}
function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2)
    args.set(argv[index].replace(/^--/u, ""), argv[index + 1]);
  return args;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readJson(args.get("manifest"));
  const built = await runSurfaceResolvedLifecycleEmission({
    manifest,
    summaryOutput: args.get("summary-output"),
  });
  process.stdout.write(
    `${JSON.stringify({
      runKind: manifest.runKind,
      gate: built.gate.gate,
      anchors: built.summary.totalAnchors,
      controls: built.summary.totalExactControls,
      assessment: built.summary.operationalAssessmentLevel,
    })}\n`
  );
}
if (pathToFileURL(process.argv[1] ?? "").href === import.meta.url)
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
