# Codex Rules For Deadem

Deadem turns replay data into factual match information and, later, bounded
analysis. Preserve factual evidence, uncertainty, and replay protections before
interpretation.

## Authority And Coordination

- The normative policy is `docs/codex/AUTONOMOUS_COORDINATION_POLICY.md`.
- Read `data/project-coordination-state.json` before execution. The task base
  must equal `lastAcceptedCommit`; `HEAD` does not imply acceptance.
- ChatGPT Work is the coordinator and sole acceptance authority. Codex executes
  only a separately authorized technical task and reports claims for Work to
  verify.
- Codex must not self-authorize, approve its own work, change the last accepted
  commit, choose a follow-up, decide a gate, or start a new phase.
- Stop after the current handoff. ChatGPT Work may start a separately authorized
  Codex execution after independent validation.
- When a surface cannot launch Codex, preserve the task and state as
  `BLOCKED_BY_SURFACE`. Never claim Work/Codex was invoked, an instruction was
  sent, or execution occurred without a real integration and evidence.
- Chat presents results and material human blockers; it does not transfer
  Work/Codex routing to Gwen.

## Critical Rules

- Replay 005 is the protected final holdout. Do not read, hash, copy, open,
  inspect, or process it unless a task explicitly authorizes final-holdout
  release.
- Replays 006-008 are unsupported bot fixtures. Do not process them unless a
  task explicitly scopes bot-fixture parser work.
- Absence, deletion, disappearance, or zero health does not prove death,
  destruction, objective completion, claim, deposit, secure, or reward.
- A favorable outcome does not prove a decision was correct.
- Do not fabricate identity, pawn generation, position, map transform, semantic
  region, lane, mechanic effect, or strategy.
- Do not execute blocked or rejected tasks. Rejected commits never become base.
- Use one task per commit. Modify only authorized paths and preserve unrelated
  user changes.
- Do not read large `output/` trees by default. Prefer specs, manifests,
  summaries, hashes, and bounded reports.

## Required Workflow

1. Identify the authorized task and read the coordination state.
2. Verify branch and base equal the accepted state; run
   `npm run codex:prepare -- --task <id>` when a spec exists.
3. Read the context packet and required paths only. Record why optional paths
   are needed.
4. Implement the scoped technical unit.
5. Run preflight, mandatory validation, and task-specific checks.
6. Generate the review packet and a complete report using
   `docs/codex/CODEX_REPORT_TEMPLATE.md`.
7. Stage explicitly, create one commit, and push only when authorized.
8. Handoff with status `VALIDATING`; do not represent the technical gate as
   Work acceptance.

## Search And Context Limits

Avoid broad scans such as `find .`, `grep -R`, `cat output/**`, or unfiltered
large diffs. Prefer targeted `rg`, `git diff --stat`, and explicit file lists.
Exclude `.git/`, `node_modules/`, `.local/`, historical outputs, replay files,
videos, caches, and binary assets from default searches.

## References

- Coordination: `docs/codex/AUTONOMOUS_COORDINATION_POLICY.md`
- Workflow: `docs/codex/WORKFLOW.md`
- Task execution: `docs/codex/TASK_EXECUTION.md`
- Current state: `docs/codex/CURRENT_STATE.md`
- Replay protection: `docs/codex/REPLAY_PROTECTION.md`
- Epistemic safety: `docs/codex/EPISTEMIC_SAFETY.md`
- Output policy: `docs/codex/OUTPUT_AND_ARTIFACT_POLICY.md`
- Task specs: `tasks/specs/`
