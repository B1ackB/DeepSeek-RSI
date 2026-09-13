# Contributing

Contribute to the Skill evolution workflow or add a concrete scenario. Start with the [README](README.md), [architecture](ARCHITECTURE.md), and repository [AGENTS.md](../AGENTS.md). Read the [extension contracts](EXTENSION-CONTRACTS.md) before changing fields.

## Getting started

1. Inspect the branch and working tree; preserve existing uncommitted work. Use `codex/` feature branches and separate checkouts/worktrees for concurrent contributors.
2. Follow the README to pin Harness, apply the sidebar patch, and build. Run `npm ci --ignore-scripts` and `npm run link:harness -- /absolute/harness/path`.
3. Run `npm run check` for a baseline. Use a separate DSH_HOME for development/browser tests; never open the same SQLite database from two hosts.
4. Choose a bounded change from the ownership table. Define necessary fields, failure behavior, and compatibility before implementation.

The repository has no selected open-source license and retains the private package flag. This guide explains engineering collaboration, not future publication or licensing rights.

## Dividing work

| Area | Main files | Reviewable contribution |
|---|---|---|
| New scenario | `src/scenarios/<name>.ts` | Recognition, instructions, compilation, valid and failing examples |
| Comparison UI | `src/client/comparison.tsx` | Charts, accessibility, sidebar/full preview verification |
| Main flow | `src/mainflow.ts` | Transitions, iteration, version choice; synchronize schemas first |
| Requests and recovery | `src/usage.ts`, `src/store.ts` | Accounting, cancellation, migration, idempotency |
| Candidates/execution | `src/candidates.ts`, `src/docker.ts` | File boundaries, compilation, resource cleanup evidence |
| Documentation/reproduction | `docs/`, `scripts/` | Reproducible instructions separating fixtures from real calls |

Review shared contracts together; agree on minimal fields before independent host/UI implementation. Avoid bulk file moves merely to assign ownership. Fixed-response tests do not establish model improvement.

## Add a Skill scenario

A JSON report scenario can reuse generation, accounting, the sidebar, and versions. Built-ins live in `src/scenarios/` and join the registry. External trusted Harness plugins use `@b1ackb/deepseek-rsi/scenarios`:

```ts
import type { Context } from '@deepseek-ai/cordis';
import type { SkillScenario } from '@b1ackb/deepseek-rsi/scenarios';

const scenario: SkillScenario = {
	info: { id: 'json-report', version: '1', label: 'JSON report', kind: 'text' },
	matchesSkill: skill => skill.name === 'json-report',
	matchesRequest: () => false,
	instructions: 'Generate a JSON report from the supplied input. Return only complete JSON.',
	async compile(output, signal) {
		signal.throwIfAborted();
		const value: unknown = JSON.parse(output);
		return {
			kind: 'text',
			content: JSON.stringify(value, null, '\t'),
			detail: 'JSON parsed successfully; the user judges its content.',
		};
	},
};

export const inject = ['rsiScenarios'];
export function apply(ctx: Context) {
	ctx.effect(() => ctx.rsiScenarios.register(scenario));
}
```

This checks parseability only. Use a runtime schema if a specific structure is required; valid JSON does not establish correct content. With the matching Skill available, `/json-report task description` enters the shared confirmation, revision, and comparison flow.

Install/load the extension as a trusted Harness plugin depending on RSI's service. `register` returns a disposer. Do not retain a different profile's Context in global process state. The entry point starts in g2.5 and has no cross-host-version stability promise yet.

## Interface rules

- IDs are unique within a host. Increment version when artifact protocol, instructions, or compilation semantics change.
- Recently registered specific scenarios take priority. Text fallback only handles explicit Skills, not ordinary chat.
- Core seals the input. Both sides use the same instructions; compilation must not relax checks based on candidate identity.
- `compile` returns only `kind`, bounded `content`, and `detail`. It cannot return a score instructing core to activate.
- Execute HTML only in isolated previews. Prefer text for other content; do not convert untrusted Markdown directly into same-origin HTML.
- Use the supplied signal for long operations. Modules introducing processes/containers own timeout, cancellation, finally cleanup, and verification that resources are gone.
- Do not bypass the ledger with another model SDK. The interface currently fits one tool-free artifact request; multi-step tool scenarios need a host execution contract first.
- Scenarios are trusted host code. Review dependencies and file operations; candidates and Web input cannot register scenarios dynamically.

## Validation

```sh
npm run typecheck
npm test
npm run build
git diff --check
```

Scenario changes need valid output, compilation/format failure, and matching-boundary checks. Authorization/version/accounting changes need stale operations, duplicate submission, unknown usage, and cancellation checks. Migrations need data preservation and rollback on failure. Use existing Node tests rather than another toolchain.

`scripts/browser-mainflow.mjs` runs against the isolated profile from `scripts/g1-browser-fixture.ts`, with the real model adapter disabled. It checks confirmation, authenticated previews, charts, feedback preparation, reload without replay, adoption, linked sessions, and readable sidebar labels. Logs and authenticated launch URLs stay in `.cache/`. Use a fresh directory for each independent test.

Docker probes are `scripts/docker-probe.ts` (fixed lifecycle samples) and `scripts/docker-candidate-probe.ts` (Python/Shell syntax only). Report them as validated only when actually run.

Real calls require advance confirmation of the model, request/input/output limits, cumulative threshold, and time window. Historical budgets cannot fund new batches. Never delete the ledger to rerun failed debugging. Tests and examples do not authorize spending.

## Submission and review

- Describe the problem, resulting behavior, compatibility impact, and validation in the PR. State whether real calls were used and what they establish.
- Keep changes reviewable. Register new documents in the README. Do not commit credentials, authenticated URLs, local databases, node_modules, or build caches.
- Write project documentation in English. Preserve runtime fixtures and original experimental artifacts in their source language and exact bytes; explain them in English.
- Use tabs, strict TypeScript, and English identifiers. Explanatory code comments may remain Chinese. Reuse Harness, Node, and existing dependencies.
- Do not call compilation-only checks functional validation. Label unknown tokens; a single duration is not evidence of stable performance improvement.
- Use short readable sidebar labels such as baseline/candidate and current revision. Do not expose hashes or task/session IDs as normal user text. Internal identifiers still validate state; retain readable diffs, failure reasons, and costs.
- Keep documentation, schemas, implementation, and necessary checks aligned. Explain upgrade/rollback when public interfaces or databases become incompatible.
- Close test-owned services and browsers. Never stop another contributor's or the user's existing services.

## Useful next contributions

Concrete text/report scenarios, comparison accessibility, multi-round history, rollback, and reproducible installation scripts. Multi-file builds and remote execution need fuller execution contracts. Prove a small working scenario before widening the public interface.
