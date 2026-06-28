# Codex task — Process replay 91119257 with manual map landmarks

## Objective

Process a new Deadlock replay and integrate the manually annotated landmarks into the existing replay-analysis project. Treat this as a new evidence packet, not as proof that the current detector is correct.

The main goal is to:

1. ingest the `.dem` and video;
2. align demo time, video time and extracted telemetry;
3. use the manual observation windows as landmark calibration evidence;
4. map stable world coordinates to normalized minimap coordinates;
5. update the project's raw datasets and experiment documentation;
6. report what was confirmed, contradicted or still ambiguous.

Do not infer macro events, lane transitions, rotations, combat intent or objective decisions unless the current project state explicitly supports them. Preserve the limitations established in previous experiments.

## Input files

- `match_91119257_events.csv`
- `match_91119257_metadata.json`
- `map_reference.png`
- `postgame_scoreboard.png`

External sources:

- Video: https://drive.google.com/file/d/1VPloEzjF6qWFBg3G1RUeUDCE6Xe48aq3/view?usp=drive_link
- Demo: https://drive.google.com/file/d/1jwYnzR9RCNd_QdKq2n_KDA5bicxSlDMC/view?usp=drive_link
- Map reference: https://deadlock.wiki/The_Cursed_Apple

## Match identity

- Match ID: `91119257`
- Mode: bots, 6v6
- Player hero: `Celeste`
- Player team: `Hidden King`
- Assigned lane: green/right
- Video duration: `30:43`
- Post-game match duration: `30:22`

The duration difference means video time must not be assumed to equal match time. Estimate and document the offset or time transform from observable events. Do not silently force a 1:1 alignment.

## Terminology normalization

Use the following canonical labels:

- `T1` = `easy_camp`
- `T2` = `medium_camp`
- `T3` = `hard_camp`
- `Sinner's Sacrifice` = `vault_camp`
- `Buff` = `powerup`
- `Secret Shop` = `secret_shop`
- `Guardian`, `Walker`, `Base Guardians`, `Shrine`, `Archmother` remain separate objective/landmark classes.

Rows containing both a camp and Sinner's represent co-located or visually grouped landmarks and must retain both labels.

## Map conventions

Use `map_reference.png` as the 2D reference.

Normalized coordinate system:

- origin `(0,0)` at top-left;
- `x` increases to the right;
- `y` increases downward;
- coordinates stored in `[0,1]`;
- ally/Hidden King base is at the bottom;
- enemy base is at the top.

The Mid Boss was not shown in the manual video sweep. Add it as a separately sourced landmark:

- horizontal location: exact center of the map;
- vertical level: underground;
- confidence: `user_asserted`, not `video_confirmed`.

Tunnels and stairs were not mapped. Do not synthesize their paths. Vertical transitions may be recorded only when the replay/video or map data provides direct evidence.

## Required workflow

### 1. Preserve the packet

Copy or register the input packet under the project's evidence/raw-data structure. Record checksums for local files and the retrieval date for external inputs.

Do not overwrite earlier match evidence.

### 2. Retrieve and validate inputs

Download the video and `.dem` through the provided links if they are not already available.

Validate:

- files open successfully;
- demo Match ID, map and roster match the supplied metadata where extractable;
- Celeste is the tracked player;
- scoreboard and demo identify the same match;
- source durations and tick/time ranges.

If any identity field conflicts, stop derived processing and report the mismatch.

### 3. Parse the event CSV

Validate schema, ordering and timestamps.

Important known issue:

- the final `Teleporter do Metrô Inimigo` row is manually recorded as `23:50–23:55`;
- it occurs after the `24:40–24:45` event and duplicates an earlier interval;
- test the likely correction `24:50–24:55` against the video;
- never replace the original value without preserving provenance;
- store `original_video_start/end`, `resolved_video_start/end`, resolution method and confidence.

### 4. Establish time alignment

Find at least two clearly identifiable anchor events shared by video and demo, preferably:

- death at `07:25–07:30`;
- death at `10:05–10:10`;
- respawn at `10:20–10:25`;
- another unambiguous state change if available.

Fit the simplest defensible mapping between video time and demo/match time:

- constant offset first;
- linear drift only if multiple anchors demonstrate it.

Output:

- chosen transform;
- residual error per anchor;
- uncertainty;
- whether each manual window was expanded during matching.

### 5. Extract tracked-player telemetry

For Celeste, export the most reliable raw data available, such as:

- demo tick;
- demo time;
- aligned video time;
- world `x/y/z`;
- velocity or displacement;
- alive/dead state;
- team;
- lane-related fields already supported by the project;
- nearby known landmarks only after coordinate calibration.

Do not fabricate unavailable fields.

### 6. Landmark calibration

For every manual observation window:

1. inspect the video frame range;
2. identify the intended landmark;
3. determine whether the camera is centered on the landmark, merely includes it, or is ambiguous;
4. correlate with demo world coordinates, camera data or stable entity coordinates;
5. create/update a canonical landmark table.

Recommended landmark output columns:

- `landmark_id`
- `canonical_type`
- `tier`
- `allegiance`
- `lane`
- `sector`
- `vertical_level`
- `world_x`
- `world_y`
- `world_z`
- `map_x_norm`
- `map_y_norm`
- `source_match_id`
- `source_event_id`
- `evidence_type`
- `confidence`
- `notes`

Do not use the player's position as the landmark coordinate when the player is standing away from it. Prefer entity coordinates or repeated stable observations.

### 7. Handle repeated landmarks

Several landmarks are intentionally revisited, including camps next to Sinner's Sacrifice and both Secret Shops.

Use repeated observations to:

- estimate coordinate consistency;
- detect mistaken labels;
- calculate spread/error;
- choose a canonical coordinate;
- retain every supporting event rather than deduplicating evidence away.

### 8. Verticality

Keep `world_z` and `vertical_level` as first-class fields.

At minimum distinguish:

- `surface`
- `rooftop`
- `elevated_bridge`
- `underground`
- `unknown`

A 2D minimap collision between two landmarks is not evidence that they occupy the same navigable location.

### 9. Outputs

Create or update, following existing repository conventions:

1. raw replay telemetry for match `91119257`;
2. aligned event table linking CSV events to demo ticks/times;
3. canonical landmark table;
4. landmark-observation evidence table;
5. validation report;
6. experiment/report document explaining changes and limitations;
7. any automated tests needed for the parser, alignment and coordinate normalization.

Prefer machine-readable CSV/Parquet/JSON for data and Markdown for reports.

### 10. Validation report

The report must separate:

- `confirmed`
- `partially_confirmed`
- `contradicted`
- `unresolved`
- `user_asserted_only`

Include:

- event coverage count;
- events successfully aligned;
- ambiguous windows;
- corrected timestamps;
- coordinate spread for repeated landmarks;
- landmarks visible only in the manual video;
- landmarks resolved directly from demo entities;
- missing tunnels/stairs;
- Mid Boss treatment;
- known model limitations.

### 11. Project-state discipline

Before editing, read the repository's current state, decisions and experiment documents, including the latest experiment and `DEC-005` if present.

Follow the efficient Codex workflow previously adopted:

- inspect only the files needed;
- make one coherent implementation pass;
- run targeted tests;
- avoid repeatedly rereading large files;
- return a compact execution report with paths, commands, tests and unresolved questions.

Do not claim that this packet validates lane-transition, rotation, combat, objective or macro-event detection. It is primarily landmark, coordinate and replay-time calibration evidence.

## Acceptance criteria

The task is complete when:

- input identity is validated;
- video/demo alignment is documented with measurable error;
- every CSV row has an alignment status;
- the duplicated final timestamp is resolved or explicitly left unresolved;
- landmark coordinates preserve vertical information;
- repeat observations are reconciled with confidence and spread;
- Mid Boss is added only as `user_asserted` unless independently verified;
- tunnels/stairs remain unmapped unless direct evidence is found;
- tests pass;
- repository state and experiment documentation are updated;
- final report clearly lists facts, inferences, failures and next recommended experiment.
