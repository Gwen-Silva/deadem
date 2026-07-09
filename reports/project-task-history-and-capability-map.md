# Project Task History And Capability Map

Task 178 investigated committed task files, reports, docs, registry entries, package scripts, and git history to consolidate the Deadem task record through Task 177. No replay files were opened or processed.

## Results

- Tasks indexed: 177
- Completed tasks found: 164
- Blocked tasks found: 7
- Commits mapped: 171
- Tasks with partial evidence: 90
- Capabilities mapped: 17

## Active Capabilities

The active stack is replay protection, output policy, task gates, upstream update check, parser char decoder fix, death_validation compact schema, manifest-driven batch runner, batch mode, provenance metadata, protection/schema/output/size audits, and the bounded 32-replay death_validation baseline.

## Superseded Areas

The exact-15 and expanded-16 baselines are historical coverage references. The replay_010/replay_011 missing_entity diagnostic path is superseded for those canaries by the upstream char decoder fix. Earlier spatial/canonical work remains historical unless explicitly reauthorized.

## Historical Gaps

Some early tasks have partial evidence because current versioned task files do not fully reconstruct their implementation details. They are marked with `evidenceStatus: partial` in `data/task-contribution-index.json`.

## Recommendations

- Treat `bounded_inbox_batch_pilot_32_task177` as the active compact baseline.
- Before deep parser debugging, run the upstream update check.
- Do not treat death_validation counts as death facts.
- Avoid richer source classes until schema, output policy, and consumption contracts are designed.
- Prioritize identity mapping, hero/team mapping, time normalization, alive/dead/respawn state, and canonical death event design before attribution or teamfight analysis.
