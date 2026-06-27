# Deadem Replay Analysis

This repository is an independent research project built on top of the open-source [`deadem`](https://github.com/Igor-Losev/deadem) replay parsing project created and maintained by [Igor Losev](https://github.com/Igor-Losev).

The original `deadem` project provides the Source 2 replay parsing infrastructure used by this repository. I did not create the parser, its published packages, or the Deadem Explorer website.

This repository uses that infrastructure to study Deadlock replay data and develop reproducible datasets, validation methods, and higher-level gameplay analysis.

## Project purpose

The goal of this project is to extract structured information from Deadlock replays without assuming in advance how the game should be played.

The current work focuses on building and validating the lower-level data needed for later gameplay analysis, including:

* player identity and hero reconciliation;
* game clock and tick-domain reconstruction;
* canonical player timelines;
* map coordinates and lane topology;
* spatial presence;
* movement segments;
* lane occupancy;
* candidate rotations and journeys;
* data quality and uncertainty.

The project is currently focused on data extraction and model validation. It does not yet claim to reliably identify strategic intent, player roles, macro decisions, combat decisions, or optimal gameplay.

## Relationship to the upstream project

This repository was created from:

* **Upstream repository:** [`Igor-Losev/deadem`](https://github.com/Igor-Losev/deadem)
* **Original project website:** [deadem.com](https://deadem.com)
* **Original author and maintainer:** [Igor Losev](https://github.com/Igor-Losev)

The upstream project is a collection of JavaScript packages for parsing and playing back Valve Source 2 demo and replay data.

Its parsing stack and game-specific packages remain the work of their original authors and contributors.

The independent work in this repository is mainly located in:

* [`experiments/`](./experiments) — sequential replay-analysis experiments;
* [`scripts/`](./scripts) — validation and project utilities;
* [`docs/`](./docs) — architecture, data definitions, decisions, and project state;
* [`reports/`](./reports) — experiment and methodology reports;
* [`tasks/`](./tasks) — structured tasks used during development.

Unless explicitly stated otherwise, files inherited from the upstream repository should not be interpreted as original work from this repository.

## Research approach

The experiments are intentionally incremental.

Each experiment should:

1. start from an identified limitation or uncertainty;
2. use existing derived data whenever possible;
3. produce inspectable outputs;
4. preserve ambiguous or unknown states;
5. avoid treating heuristics as ground truth;
6. validate lower-level data before introducing higher-level interpretation;
7. document inputs, outputs, assumptions, and limitations.

The experiment sequence is documented in [`docs/EXPERIMENT_INDEX.md`](./docs/EXPERIMENT_INDEX.md).

The current state of the project is documented in [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md).

## Current status

The repository currently contains 23 numbered experiments.

The latest stage is the calibration of lane occupancy. The current model is being evaluated before it is used as a basis for rotation, combat, objective, or broader macro analysis.

The results currently represent exploratory analysis of a limited replay dataset. They should not be treated as general conclusions about Deadlock gameplay.

## Repository structure

```text
experiments/   Sequential replay-analysis experiments
scripts/       Validation and project maintenance tools
docs/          Project state, architecture, decisions, and data definitions
reports/       Methodology and execution reports
tasks/         Structured pending and completed tasks
output/        Locally generated derived data, not committed
samples/       Local replay files, not committed
external/      Local external reference data, not committed
```

Replay files and generated outputs are intentionally excluded from Git because they may be large, derived, or unsuitable for redistribution.

## Requirements

* Node.js
* npm
* A compatible Deadlock `.dem` replay
* The dependencies and packages provided by the upstream project

Install the dependencies with:

```bash
npm install
```

## Running the research experiments

The scripts under [`experiments/`](./experiments) represent a sequential investigation. Later experiments may depend on outputs produced by earlier ones.

Before running an experiment, inspect:

* [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md)
* [`docs/EXPERIMENT_INDEX.md`](./docs/EXPERIMENT_INDEX.md)
* the experiment source file;
* the expected local input and output paths.

Generated data is written to `output/` and is not committed to this repository.

## Validation utilities

The repository includes utilities for validating existing experiment files without reprocessing the replay:

```bash
npm run validate:experiment -- 23
npm run check:outputs -- 23
npm run summarize:experiment -- 23
```

These commands validate the implementation and generated files associated with an experiment. They do not establish that the resulting gameplay interpretation is correct.

## Upstream packages

The original `deadem` project includes the following packages:

| Package                                | Upstream description                                               |
| -------------------------------------- | ------------------------------------------------------------------ |
| [`@deademx/engine`](./packages/engine) | Shared, game-agnostic replay parsing and playback engine.          |
| [`deadem`](./packages/deadem)          | Deadlock implementation built on top of `@deademx/engine`.         |
| [`@deademx/cs2`](./packages/cs2)       | Counter-Strike 2 implementation built on top of `@deademx/engine`. |
| [`@deademx/dota2`](./packages/dota2)   | Dota 2 implementation built on top of `@deademx/engine`.           |

These packages are inherited from the upstream project. This repository does not claim authorship or maintainership of them.

For documentation about the parser and its packages, refer to the upstream repository and its package documentation:

* [`@deademx/engine`](./packages/engine/README.md)
* [`deadem`](./packages/deadem/README.md)
* [`@deademx/cs2`](./packages/cs2/README.md)
* [`@deademx/dota2`](./packages/dota2/README.md)

## Limitations

This is an early research project based on incomplete and evolving knowledge of Deadlock replay data.

Current limitations include:

* analysis based on a limited number of replays;
* build-specific game data;
* fields and labels that still require validation;
* heuristic spatial and temporal classifications;
* incomplete ground-truth validation;
* risk of overfitting models to a specific replay or map state;
* no reliable inference of strategic intent yet.

A successful script execution does not mean that its model is strategically correct.

## Attribution

This project depends on and was made possible by the work in:

* [`Igor-Losev/deadem`](https://github.com/Igor-Losev/deadem) — Source 2 replay parsing infrastructure used as the foundation of this repository;
* [`dotabuff/manta`](https://github.com/dotabuff/manta) — Dota 2 replay parser in Go;
* [`saul/demofile-net`](https://github.com/saul/demofile-net) — Counter-Strike 2 and Deadlock replay parser in C#.

All credit for inherited code remains with the original authors and contributors.

## License

This repository retains the [MIT License](./LICENSE) from the upstream project.

See the repository history and the upstream project for original authorship and contribution records.
