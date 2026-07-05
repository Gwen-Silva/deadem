# Replay Protection

Replay 005 is the protected final holdout. Unless a task explicitly authorizes final-holdout release, do not read, hash, copy, open, inspect, parse, process, or use it for debugging.

Replays 006-008 are unsupported bot fixtures. They may be mentioned as unsupported, but must not be processed unless a task explicitly scopes bot-fixture parser work.

Authorized replay means the task names the replay and permits the operation. Protected replay means all access is forbidden. Incompatible replay means the task may document status but must not force it through unsupported tooling.

Synthetic fixtures are allowed when they contain no real replay bytes, no copied replay content, and no path that causes a real replay to be opened.

Forbidden examples:

- `samples/partida_005.dem`
- paths matching replay 005 aliases;
- bot fixture processing for 006-008;
- committing replay binaries, videos, frames, or full dumps.
