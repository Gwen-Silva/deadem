# Scientific Workflow

This document describes Deadem's high-level project and evidence workflow. It
does not define the Codex command workflow. For task execution commands, context
packets, validation packets, and compact review handoff, use
`docs/codex/WORKFLOW.md`.

## Evidence Standards

Deadem separates observations, deterministic derivations, independent support,
human annotations, hypotheses, and interpretations. A higher-level conclusion
must not rewrite lower-level evidence.

Do not infer:

- death from health zero alone;
- objective destruction or completion from deletion alone;
- lane occupancy from nearest lane alone;
- decision quality from outcome alone;
- spatial identity from a transform that was fitted using that same identity.

Uncertainty must remain visible when evidence is partial, version-mismatched,
or derived from advisory human knowledge.

## Task Lifecycle Concepts

Task files and specs may be `blocked`, `pending`, `authorized`, `active`, or
`completed`. Current execution uses explicit authorization and
`tasks/specs/<id>.json`; the old autonomous queue-runner is deprecated.

Blocked tasks must not be executed until explicitly authorized. A task may
create exactly the follow-up allowed by its own scope, but roadmap order alone
does not authorize execution.

## Scope Freezing

For the five-human-replay pilot, scope changes are allowed only when a finding:

- makes a required output factually incorrect;
- produces a false positive gate;
- accesses protected data;
- changes canonical facts without authorization;
- prevents the declared result.

Other findings belong in backlog after Task 096. Do not create another workflow,
cleanup, documentation, or repository-refactoring task before the pilot
finishes.

## Human Review Escalation

Human review is an escalation mechanism, not a default next step. Request it
only when semantic ground truth cannot be derived from available data, the
unresolved distinction materially changes the next project decision, the sample
set has been minimized, and every requested question is explicit.

Autonomous evidence may support or weaken a conclusion, but it is not human
ground truth.

## Stop Conditions

Stop when:

- no authorized task remains;
- the next stage requires a human milestone decision;
- a blocked gate has not been fulfilled;
- required input is unavailable;
- evidence is contradictory in a way that changes the decision;
- replay processing would be required but is not explicitly authorized;
- task acceptance criteria cannot be tested.

After Task 096, do not create Task 097 automatically. Stop and wait for a human
milestone decision.

## Reports

Reports should summarize changed files, commands, validation results, evidence,
and remaining uncertainty. They should not paste full JSON outputs, raw replay
data, full logs, long tables, or chat history.
