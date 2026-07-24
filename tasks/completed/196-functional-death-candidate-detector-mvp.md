# Task 196 - Build Functional Death-Candidate Detector MVP

Status: completed

Base: `edf5dd86afae10b976d586e05c4b5016b7556700`

Technical gate claim: `functional_death_candidate_detector_mvp_bounded32_ready`

The new detector consumes an authorized replay through the accepted
one-second structural observation path and emits deterministic candidate rows
with timestamp, score, contributing signals, observed horizon and abstract
surface identifier.

The bounded run processed 32/32 replays in 1,534.3 seconds, emitted 2,664
candidates and recorded zero failures. Every replay contributed candidates,
with a per-replay range of 38 to 127. Scores range from 0.853333 to 1.0.

Evaluation-only overlap counted 2,434 known structural anchors and 85 accepted
hard challengers. These annotations do not change the structural score. Two
real executions of replay_010 emitted byte-identical 46-candidate artifacts.

The authorized report-validator repair permits factual explanations of valid
null values while preserving rejection of genuine unresolved markers.

Every candidate remains an unconfirmed structural hypothesis. No confirmed
death, confirmed non-death, victim identity, attribution, killer/victim,
teamfight or gameplay interpretation was emitted.

Final acceptance remains pending independent ChatGPT Work validation. No next
task or module is started by this handoff.
