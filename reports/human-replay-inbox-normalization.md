# Human Replay Inbox Normalization

## Frozen Acceptance Matrix

| Requirement | Status |
| --- | --- |
| Eligible replay candidates moved by rename only. | met |
| Metadata stubs exist for eligible candidates. | met |
| Replay 005-like names rejected. | met |
| Bot fixture 006-008-like names rejected. | met |
| File contents not read. | met |
| Hashes not computed. | met |
| Replay processing not performed. | met |
| .dem files not committed. | met |
| Task 101 not created. | met |

Gate: `human_replay_inbox_normalized`

## Inbox Status

- Accidental inbox: `replays/inbox/`
- Accidental inbox existed: true
- Canonical inbox: `.local/deadem/replays/inbox/`
- Canonical inbox existed before run: true
- .dem files moved: 11
- Metadata files created: 11
- Metadata files preserved: 11
- Metadata files repaired: 0
- Candidates ready: 11
- At least 10 candidates ready: true
- Additional candidates still needed: 0

## Rejected Filenames

- none

## Protections

- File contents read: false
- Hashes computed: false
- Replay processing performed: false
- Copy fallback used: false

## Next Recommended Action

Review the generated metadata stubs in the local ignored inbox and confirm each
candidate is a human match before any future processing task is authorized.

Task 101 was not created.
