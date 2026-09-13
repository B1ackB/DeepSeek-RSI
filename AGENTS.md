# DeepSeek RSI Development Guidelines

## Documentation routing

- Start at [docs/README.md](docs/README.md), then read the material relevant to your task.
- Current architecture and collaboration: [architecture](docs/ARCHITECTURE.md), [contributing](docs/CONTRIBUTING.md), and [scenario/comparison contracts](docs/EXTENSION-CONTRACTS.md). Register new scenarios through `src/scenarios/`; reuse authorization, accounting, and version management.
- Product: [framework](docs/FRAMEWORK.md) and [frontend scenario](docs/FRONTEND-SCENARIO.md). Fields and states: [core contracts](docs/CONTRACTS.md), [G1](docs/G1-CONTRACTS.md), and [G2](docs/G2-CONTRACTS.md).
- Historical evidence: [G0](docs/G0-REPORT.md), [G1](docs/G1-REPORT.md), and [G2 preparation](docs/G2-REPORT.md). Historical reports do not replace current source checks.
- Keep this AGENTS.md as the only root development guide. Put project descriptions, designs, contracts, research, and acceptance reports in `docs/`; register new documents in its index. SKILL.md and references in `fixtures/` are runtime resources and remain in place.

## Basis for implementation

- Read the current Gate's code, [framework](docs/FRAMEWORK.md), and [contracts](docs/CONTRACTS.md), and inspect Git status before implementing. Do not present a design or an old validation as current implementation evidence.
- Refine contracts per Gate: define fields, constraints, transitions, and failure behavior before coding. Do not prebuild unused objects or extension interfaces.
- Ask about unclear product requirements and tradeoffs. Verify technical feasibility through source and controlled experiments rather than asking the user to guess.
- G0 integration is implemented; see its report for evidence and limitations. The user authorized G0, its dedicated test Skill, its first paid batch, and OrbStack initialization, then authorized G1 on 2026-09-08 after necessary G0 follow-up checks. Do not extend these approvals to G2–G5 or new paid batches. Formal evaluation configuration is separate.
- Subsequent development authorization covered the initial frontend Skill and G2 preference preparation. Refine each execution contract before candidate work; historical paid budgets cannot fund new batches.

## Ponytail and code style

- Keep ponytail active at full intensity until the user changes this preference. Understand the actual call chain, then implement the smallest solution that meets the requirement.
- Use tabs for code indentation and English identifiers. Project documentation is written in English. Explanatory code comments may remain Chinese; explain reasons and limitations. Preserve original runtime fixtures and immutable experimental evidence in their source language.
- Prefer existing project/Harness capabilities, then the standard library, platform features, and installed dependencies. Explain why these are insufficient before adding a dependency.
- Keep one TypeScript plugin package, ordinary functions, and small modules with clear responsibilities. Do not introduce multiple packages, generic frameworks, factories, single-implementation interfaces, or speculative configuration without an actual need.
- Use the existing EditorConfig tab convention, strict TypeScript, esbuild, and Node's test runner. Commands are in package.json. Do not add overlapping formatting or test toolchains.
- Use a `ponytail:` comment for a deliberate simplification with a concrete limit and upgrade trigger; avoid routine commentary on ordinary code.

## Contracts and boundaries

- Validate model output, Web input, persisted data, and process results at their trust boundaries. TypeScript types do not replace runtime validation.
- Each cross-boundary object has one executable authoritative definition. Infer types where possible rather than copying them. G0 determines validation mechanisms; do not assume a new library is needed.
- Host code owns authorization, budgets, compilation checks, and active version pointers. Users decide whether to adopt; functional or aesthetic scores must not make that choice for them. Model-reported success cannot replace host checks.
- Unknown usage is not zero. Stale state cannot write, and partial work cannot pass. Preserve errors and recoverable state.
- Reuse Harness credential management. Never put credentials in documentation, logs, fixtures, or commits.
- Update affected implementation and checks when a contract changes. Explain migration or compatibility for breaking changes; never silently clear persisted data.

## Validation and delivery

- Keep minimal repeatable checks for nontrivial logic, especially permissions, state conflicts, accounting, cancellation, and recovery. Prefer existing tools or the standard library.
- Do not add tests mirroring low-impact wording or presentation changes. After checks pass, broaden them only for new changes, failures, or unresolved concerns.
- Confirm the model, request count, output cap, and necessary budget before real paid calls. Documentation examples are not spending authorization.
- Close services, subprocesses, and containers started for testing unless the user asks to retain them. Clean up by recorded ownership; never stop the user's existing processes.
- Verify release of resources before claiming cleanup. Report remaining resources on failure. Distinguish implemented, validated, and unvalidated work.
- On 2026-09-08 the user authorized the documented main workflow. See [g2.3 evidence](docs/MAINFLOW-REPORT.md); previous paid-call authorization still does not apply to new batches.
- On 2026-09-13 the user authorized continuing from uncommitted g2.4 work to implement user comparisons, sidebar feedback, and collaboration across Skill types. Paid calls still require a separate budget. SQLite is now version 6; preserve historical data.
