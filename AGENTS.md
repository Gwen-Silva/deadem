# Codex Rules For Deadem

Deadem turns replay data into factual match information and, later, bounded match analysis. Current work must preserve factual evidence, uncertainty, and replay protections before any interpretation layer exists.

## Critical Rules

- Replay 005 is the protected final holdout. Do not read, hash, copy, open, inspect, or process it unless a task explicitly authorizes final-holdout release.
- Replays 006-008 are unsupported bot fixtures. Do not process them unless a task explicitly scopes bot-fixture parser work.
- Absence, deletion, disappearance, or zero health does not prove death, destruction, objective completion, claim, deposit, secure, or reward.
- A favorable outcome does not prove a decision was correct.
- Do not fabricate player identity, entity identity, pawn generation, position, map transform, semantic region, lane, mechanic effect, or strategy.
- Do not execute a blocked task without explicit authorization.
- Use one task per commit. Do not execute follow-up tasks automatically.
- Modify only files in the authorized task scope. Preserve unrelated user changes.
- Do not read large `output/` trees by default. Prefer task specs, manifests, summaries, hashes, and bounded reports.

## Required Workflow

1. Identify the authorized task and its spec.
2. Run `npm run codex:prepare -- --task <id>` when a spec exists.
3. Read the context packet and only required paths.
4. Use optional paths only when needed, and record why.
5. Implement the scoped change.
6. Run local validation.
7. Generate a review packet.
8. Stage explicitly, create one commit, and push only when requested.
9. Stop after the handoff. Do not execute the follow-up task.

## Search And Context Limits

Avoid broad scans such as `find .`, `grep -R`, `cat output/**`, or unfiltered diffs over large outputs. Prefer targeted commands such as `rg "<term>" <allowed-paths>`, `git diff --stat`, and `git diff -- <allowed-files>`.

Exclude `.git/`, `node_modules/`, `.local/`, historical outputs, replay files, videos, caches, and binary assets from default searches. A broader search requires a recorded reason and must still exclude forbidden paths.

## References

- Workflow: `docs/codex/WORKFLOW.md`
- Replay protection: `docs/codex/REPLAY_PROTECTION.md`
- Epistemic safety: `docs/codex/EPISTEMIC_SAFETY.md`
- Task execution: `docs/codex/TASK_EXECUTION.md`
- Output policy: `docs/codex/OUTPUT_AND_ARTIFACT_POLICY.md`
- Current compact state: `docs/codex/CURRENT_STATE.md`
- Task specs: `tasks/specs/`
