# Deadem Project Vision and Development Roadmap

This document is the canonical long-term strategic reference for Deadem. It
describes the intended product and research direction, not the current
implementation surface. Current capabilities, gates, and blockers remain
defined by `docs/PROJECT_STATE.md`, `docs/NEXT_MILESTONE.md`, task files, and
the reports they cite.

## 1. Executive Vision

Deadem is intended to become an independent, evidence-bounded Deadlock
replay-analysis platform.

The mature system should ingest replay files, reconstruct factual match state,
detect spatial, economic, combat, objective, and behavioral patterns, evaluate
bounded decision windows, and produce evidence-backed conclusions.

GPT and Codex are development assistants, not runtime dependencies. They may
help build, test, research, review, and document the project, but the runtime
analysis pipeline must remain useful when no LLM is available.

## 2. Product Boundary

### Development Assistance

GPT and Codex may help with coding, research, test design, documentation,
hypothesis generation, and review. Their work must be captured as versioned
code, schemas, reports, tests, or task history before it becomes project state.

### Production Runtime

The final production pipeline must independently perform replay parsing,
normalization, state reconstruction, feature generation, event detection, model
inference, confidence calculation, and structured report generation.

### Optional Language Layer

An LLM may optionally convert structured conclusions into natural-language
explanations. Removing that language layer must not remove factual states, event
detections, metrics, model classifications, evidence references, confidence, or
limitations. Optional prose cannot silently create facts absent from structured
evidence.

## 3. Final User Experience

The ideal command-line workflow is:

```text
deadem analyze <replay.dem>
```

Optional inputs may include validation video, expected build or patch,
selected-player focus, composition metadata, and a local model version.

A mature output package might resemble:

```text
output/<match-id>/
  manifest.json
  players.json
  timeline.jsonl
  factual-events.jsonl
  spatial-states.jsonl
  economy.json
  fights.json
  objectives.json
  decision-windows.jsonl
  model-inferences.jsonl
  analysis.json
  report.html
```

These names are architectural targets, not committed schemas unless already
implemented by a completed task.

The mature interface should support a synchronized timeline, minimap
trajectories, factual event inspection, economy graphs, objective state, fights,
player review, recurring-pattern review, hypothesis testing across matches,
evidence and provenance panels, and visible confidence and limitation displays.

## 4. Architectural Principle

The required dependency order is:

```text
Replay bytes
  -> parser
  -> normalized raw state
  -> factual state
  -> versioned map/mechanics context
  -> derived events
  -> features
  -> learned models
  -> bounded conclusions
  -> optional natural-language rendering
```

Higher layers may depend on lower layers. Lower layers must not depend on
strategic conclusions. Interpretation must never rewrite factual history. Every
derived result must preserve provenance.

## 5. System Layers

### Layer 1 - Replay Parser

Responsibilities: decode replay structures, entities, serializers, and raw
properties; preserve entity generations; retain build metadata when exposed;
and provide bounded deterministic extraction.

Non-responsibilities: strategy, intent, lane semantics, decision quality, or
patch-sensitive mechanic interpretation.

### Layer 2 - Normalized Factual State

Responsibilities: players, teams, coordinates, health, economy values,
inventory when available, cooldown/state observations when available, entity
lifecycle, raw objective/structure state, and factual event timelines.

Presence, deletion, zero health, and disappearance remain observations unless
separate evidence supports stronger semantics.

Current implementation note: Task 065 establishes the canonical replay-009
factual layer. Replay 002 is not accepted yet: Task 089's v8 package is
preserved as a rejected historical attempt, and blocked Task 094 owns the v9
terminal validation correction. This supports schema stability work only; it
still does not apply mechanics, spatial regions, lane semantics, objective
completion, or macro interpretation.

### Layer 3 - Versioned World Knowledge

Responsibilities: build mapping, map versions, structure identities, objective
mechanics, economy rules, respawn rules, item definitions, and ability
definitions.

Current-patch rules must not be silently applied to historical or unresolved
builds.

### Layer 4 - Spatial Foundation

Responsibilities: world-to-map transform, map bounds, height/floor handling,
lanes, jungle, bases, objectives, traversable connections, ziplines, regions,
and distances.

This remains a major strategic milestone and is incomplete. Task 078 supports
raw Walker team-to-faction mapping. Task 079 found no replay-specific
non-coordinate lane identity source in the currently permitted local evidence,
so handle-to-map-landmark identity and transform retry remain blocked. Task 081
parks immediate replay-009 transform work under a concrete resume contract while
the active tactical milestone shifts to cross-replay canonical generalization.

### Layer 5 - Derived Deterministic Events

Examples include death and return, combat engagement, structure damage windows,
objective availability, resource acquisition, movement transition, grouping,
retreat, push, defense, and objective setup.

These should initially use explicit rules and validated heuristics.

### Layer 6 - Feature Engineering

Per-player features may include position and velocity, health/resource state,
net worth, nearby allies/enemies, local numerical advantage, objective distance,
wave/resource opportunity, recent damage, cooldown availability, and
visibility/information state where observable.

Per-team features may include spatial distribution, lane pressure, economic
distribution, objective readiness, response time, concentration versus spread,
structure state, and available resources.

A feature is not automatically a conclusion.

### Layer 7 - Pattern Models

Initial model targets may include farming, rotating, pushing, defending,
fighting, retreating, grouping, objective setup, reset, and invasion.

Preferred early approaches are rules and heuristics as baselines, logistic
regression, gradient boosting, clustering, anomaly detection, and simple
temporal models. Transformers and reinforcement learning are not first required
models.

### Layer 8 - Decision-Window Analysis

A decision window is a bounded state in which multiple actions were plausible.
Each record should preserve information available at the time, relevant
unknowns, possible alternatives, action taken, immediate consequence, later
consequence, confidence, evidence, and limitations.

Decisions must not be judged solely by outcome. The system must preserve
distinctions such as good decision with good result, good decision with bad
result, bad decision with good result, bad decision with bad result, execution
failure, information failure, and planning failure.

### Layer 9 - Strategic And Value Models

Longer-term targets include win probability, death risk, objective success
probability, expected action value, resource allocation value, rotation value,
territorial pressure, composition-sensitive action evaluation, temporal neural
models, graph neural networks, imitation learning, offline reinforcement
learning, counterfactual models, and learned value functions.

These are long-term research directions, not current implementation
commitments.

### Layer 10 - Explanation And Reporting

Structured inference must exist before prose. A conclusion record should
resemble:

```json
{
  "claim": "",
  "claimType": "",
  "confidence": 0.0,
  "evidence": [],
  "alternatives": [],
  "knownInformation": [],
  "unknownInformation": [],
  "limitations": [],
  "modelVersion": "",
  "mechanicsVersion": "",
  "mapVersion": "",
  "replayBuild": ""
}
```

Natural-language reporting may be generated by deterministic templates, a local
language model, or an external LLM as an optional adapter. A hosted LLM must not
be mandatory.

## 6. Independence From GPT And Codex

### Required

The core system must run locally or in an independently deployable service
using versioned code and model artifacts.

### Not Required At Runtime

Runtime analysis must not require ChatGPT conversation state, Codex, manual
prompts, hidden reasoning, ad hoc human interpretation, or access to a
proprietary LLM.

### Optional Adapters

Optional adapters may include an OpenAI-compatible explanation adapter, local
LLM explanation adapter, manual-review interface, or expert annotation
interface. These adapters may explain results, collect labels, or support
review, but they cannot silently create facts absent from structured evidence.

## 7. Roadmap Phases

Roadmap phases use maturity gates rather than calendar dates.

### Phase 0 - Parser And Fixture Reliability

Goals: deterministic parsing, corpus classification, generation-safe entity
handling, holdout policy, and failure characterization.

Current status: substantially established for the current corpus, with known
unsupported bot fixtures and protected replay 005.

### Phase 1 - Factual Replay Foundation

Goals: player/team identity, lifecycle, economy observations, raw entity state,
canonical factual schema, inspection/export tools, and provenance.

Current status: established for replay 009 with constraints.

### Phase 2 - Spatial Foundation

Goals: fixed entity coordinates, landmark identity, world-to-map transform, map
bounds, map-version relationship, fixed landmark validation, and held-out
validation anchors.

Current status: parked under evidence contract. Task 078 supports raw team `3`
as Sapphire/Archmother and raw team `2` as Amber/Hidden King for six Walker
handles. Task 079 found Yellow/Blue/Green lane identity evidence unavailable
from the permitted local sources, so handle-to-named-Walker-landmark identity
remains blocked. Task 081 selected cross-replay canonical generalization as the
active tactical milestone until genuinely new non-circular spatial evidence is
available.

### Phase 3 - Spatial Semantics

Goals: generic regions, lanes, bases, jungle, objectives, height/floor,
ziplines, transition graph, and validated proximity.

Exit criteria: independent validation, bounded error policy, no nearest-lane
shortcut, and versioned map definitions.

### Phase 4 - Mechanics And Entity Semantics

Goals: versioned objective behavior, Urn, Mid Boss, Rejuvenator, structures,
waves, jungle resources, inventory, abilities, cooldowns, and economy
semantics.

Exit criteria: build mapping or explicit ambiguity, and no effect application
under unresolved mechanics.

### Phase 5 - Basic Event Detection

Goals: combat windows, damage episodes, fight candidate grouping, structure
pressure, objective interactions, farming intervals, movement transitions,
grouping, and retreat.

Exit criteria: event definitions, precision/recall evaluation, false-positive
analysis, and human-review workflows.

### Phase 6 - Macro Descriptive State

Goals: lane occupancy, rotations, map transitions, push/defense, grouping,
objective setup, invasion, reset, and map pressure prerequisites.

This phase describes behavior but does not yet judge decision quality.

### Phase 7 - Cross-Replay Generalization And Dataset Production

Goals: process multiple normal human replays, prove schema stability, avoid
replay-specific assumptions, cover builds/versions, produce dataset manifests,
separate train/validation/test data, prevent leakage, and define final-holdout
release criteria.

Replay 005 must remain protected until its existing release criteria are
satisfied.

### Phase 8 - First Independent Learned Models

Recommended first model: player-state classifier over bounded intervals.

Initial candidate classes: lane_farming, jungle_farming, rotating, fighting,
pushing, defending, retreating, grouping, objective_setup, reset, and dead.

Requirements: deterministic baseline, labeled evaluation set, class
definitions, confusion matrix, per-class precision/recall, calibration, model
versioning, and reproducible training.

### Phase 9 - Economy, Fight, Pressure, And Pattern Models

Goals: resource allocation, fight detection/refinement, pressure state,
recurring player patterns, hero/role comparisons, anomaly detection, and match
clustering.

Do not assume any proposed position 1-6 theory is ground truth. Treat it as a
hypothesis to test.

### Phase 10 - Decision Datasets And Bounded Evaluation

Goals: decision-window extraction, expert/manual labels, heuristic labels
separated from expert labels, alternative-action representation, risk/reward
features, outcome-independent review, and uncertainty-aware evaluation.

### Phase 11 - Strategic And Value Modeling

Goals: win probability, action value, counterfactual estimation, offline policy
analysis, composition-aware strategy, and longer-horizon consequences.

This phase requires much larger and more representative datasets.

### Phase 12 - Mature Product And Research Platform

Goals: CLI, local service/API, interactive report, multi-match player profile,
team review, hypothesis research, model registry, mechanics/map registry,
reproducible experiment tracking, and optional natural-language adapters.

## 8. Parallel Work Tracks

### Track A - Spatial Foundation

Current primary dependency-heavy track.

### Track B - Cross-Replay Canonical Generalization

Fallback or parallel work when spatial inputs are blocked.

### Track C - Mechanics Knowledge And Build Resolution

Can advance without strategic interpretation.

### Track D - Validation And Annotation Tooling

Includes inspector workflows, video alignment, manual labels, expert review,
and disagreement tracking.

### Track E - ML Infrastructure

May begin only as infrastructure without pretending training data is ready:
dataset manifests, experiment configuration, feature schema versioning, model
registry design, evaluation contracts, and leakage checks.

This documentation task creates no model implementations.

## 9. Ideal Repository Shape

The following conceptual layout is non-binding:

```text
deadem/
  parser/
  schemas/
  knowledge/
  maps/
  pipeline/
  spatial/
  events/
  features/
  datasets/
  annotations/
  models/
  training/
  evaluation/
  reports/
  inspector/
  ui/
  api/
  cli/
  tests/
```

The repository should evolve only when real modules justify these boundaries.
This diagram does not authorize source reorganization.

## 10. Data And Model Contracts

The project should preserve immutable raw-source references, versioned schemas,
provenance, replay build, mechanics version, map version, feature version, label
version, model version, deterministic regeneration, confidence calibration,
train/evaluation data separation, protected holdouts, and no replay-specific
leakage.

## 11. Conclusion Taxonomy

### Observation

Direct parser or validated visual state.

### Derived Fact

Deterministic transformation of observations.

### Heuristic Event

Rule-derived event with measured limitations.

### Model Inference

Learned classification or estimate.

### Hypothesis

Unconfirmed theory awaiting validation.

### Strategic Conclusion

Bounded evaluation combining factual state, context, alternatives, and model
evidence.

Every output must state its level.

## 12. Evidence And Confidence Policy

Every nontrivial conclusion should preserve source IDs, timestamps, entities,
applicable build/map/mechanics, confidence, uncertainty, missing inputs, known
counterevidence, and model/rule version.

Confidence must not be fabricated when no calibration exists. Use qualitative
confidence until quantitative calibration is implemented.

## 13. Non-Goals And Guardrails

- No strategic conclusion directly from raw deletion.
- No objective completion directly from entity absence.
- No lane identity from nearest-line shortcuts.
- No result-based decision judgment.
- No silent current-patch assumptions.
- No model trained on protected holdout data.
- No hidden LLM-only factual layer.
- No persuasive prose without traceable evidence.
- No claim that an architectural target is implemented.

## 14. Current Position In The Roadmap

### Available

- Replay parsing for supported normal fixtures 001-004 and 009.
- Replay-009 player telemetry and 6v6 identity.
- Life/death/respawn factual events.
- `m_iGoldNetWorth` endpoint summaries.
- Objective/structure observability with limits.
- Canonical factual state for replay 009.
- Static inspector, query CLI, export tooling, and workflow evaluation.
- Versioned mechanics knowledge foundation with unresolved build mapping.
- Bounded player coordinates.
- Partial fixed-entity coordinates: two late Walker generations only.
- Walker raw team values mapped to named factions by Task 078:
  `3 -> Sapphire/Archmother`, `2 -> Amber/Hidden King`.
- Task 079 concluded current local lane-only evidence is unavailable for
  replay-specific Walker handle-to-lane identity.

### Partial Or Blocked

- Exact build mapping for build `23916427`.
- Active-game clock and explicit pause intervals.
- Map transform.
- Fixed landmark identity at lane/map-landmark level.
- Lanes and regions.
- Objective proximity.
- Mechanics activation and effects.
- Fight grouping.
- Rotations.
- Map pressure.
- Decision analysis.
- Learned models.

## 15. Immediate Next Steps

The current tactical milestone is defined by `docs/NEXT_MILESTONE.md` and
`docs/FIVE_REPLAY_PILOT_PLAN.md`. This roadmap does not invent a new milestone.

1. Finish replay-002 terminal validation through Task 094.
2. Canonicalize the remaining human pilot controls through Task 095.
3. Audit the five-human-replay factual pilot through Task 096.
4. Stop after Task 096 for a human milestone decision.
5. Resume replay-009 spatial transform work only if the Task 081 evidence
   contract is satisfied.
6. Validate regions and lanes only after generic spatial projection is valid.
7. Prepare temporal feature datasets and learned classifiers only after factual,
   spatial, label, and validation prerequisites are adequate.

## 16. Success Definition

### Useful Analytical Tool

Can reconstruct and visualize factual match state and descriptive events.

### Independent AI Analyst

Can classify patterns and bounded decision windows without GPT or Codex.

### Research Platform

Can compare large replay corpora, test strategic hypotheses, train versioned
models, and estimate action value with traceable uncertainty.

