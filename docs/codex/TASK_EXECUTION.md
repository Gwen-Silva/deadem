# Task Execution Policy

This document is subordinate to
`docs/codex/AUTONOMOUS_COORDINATION_POLICY.md`.

- Execute only a technical task separately authorized by ChatGPT Work.
- Read `data/project-coordination-state.json`; use its `lastAcceptedCommit` as
  base. Neither `HEAD` nor a successful push means acceptance.
- One task and one commit per execution. Use explicit staging and stay inside
  `writePaths`; `forbiddenPaths` override all other fields.
- Specs 191+ in executable state require `coordinationPolicyVersion: 1` and the
  fifteen ordered blocks in `executionContract`.
- Use required paths first and record any optional read.
- Generate technical artifacts, validation evidence, a review packet and the
  complete Codex report. Treat every reported gate as a claim pending Work.
- Do not approve the current task, alter the accepted base, choose a follow-up,
  or start a phase.
- Stop after handoff. Work may start another separately authorized execution
  only after independent validation permits advancement.
- If Codex cannot be started from the current surface, preserve state as
  `BLOCKED_BY_SURFACE`; do not claim an instruction was sent or run.
- Pure research/review belongs to Work. A material human task must state the
  required decision, options, consequences, recommendation, safe default and
  explicit unlock.

Do not alter unrelated files or revert user changes. Validation failure,
protected data, rejected gates, base divergence or unavailable real integration
are stop conditions, not permission to simulate success.
