# Evidence packet — Match 91119257

Contents:

- `match_91119257_events.csv`: 88 manually annotated video events, normalized into a machine-readable schema.
- `match_91119257_metadata.json`: match identity, links, terminology and known limitations.
- `CODEX_INSTRUCTION.md`: implementation instructions for Codex.
- `map_reference.png`: supplied minimap reference.
- `postgame_scoreboard.png`: supplied post-game scoreboard.

Known validation issue:

- Event `E088` has an out-of-order duplicated timestamp. The likely intended interval is `24:50–24:55`, but this must be verified against the video before correction.
