# Human Replay Intake

Task 098 showed that the current generated artifacts contain only five eligible
accepted human replays. Ten more eligible human replay candidates are needed
before the 15-replay factual batch can be attempted again.

## Where To Put Files

Place future replay files only in this ignored local folder:

```text
.local/deadem/replays/inbox/
```

Do not commit replay files. The intake audit only checks whether the folder
exists and lists filenames directly inside it.

## Metadata

For each future replay file, add a sibling metadata file using the same base
name:

```text
human-replay-example.dem
human-replay-example.metadata.json
```

Use `output/replay-intake/human-replay-intake-template.json` as the template.
Keep `doNotProcessYet` set to `true`. A future explicitly authorized task will
decide whether and how to process the candidate.

## Protections

Do not place replay 005 in the inbox. Replay 005 remains the protected final
holdout and must not be read, opened, copied, hashed, inspected, or processed.

Do not place bot fixtures 006-008 in the inbox. They remain unsupported outside
explicit bot-fixture parser work.

## What This Task Does Not Do

This intake task does not read replay bytes, compute replay hashes, parse
replays, copy files, create cache entries, or generate replay artifacts.

## Future Processing

After enough human candidates are present with metadata, a future task may
authorize processing. That future task must still preserve replay 005
protection, keep bot fixtures out of scope, and record provenance before any
candidate becomes eligible for a larger factual batch.
