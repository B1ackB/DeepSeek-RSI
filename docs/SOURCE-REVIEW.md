# DeepSeek RSI: Related Project Source Review

[Documentation](README.md) · [Development rules](../AGENTS.md)

Research date: 2026-09-07. This is a translation of the historical pinned-source review, not a new audit of today's upstream projects. Its proposed scoring/search policies belong to the [archived framework](HISTORY-FRAMEWORK-G2.4.md); current requirements are in [FRAMEWORK.md](FRAMEWORK.md).

## 1. Conclusion and evidence scope

Build an independent native DeepSeek Harness plugin rather than embedding another Python Agent runtime. This does not imply similar implementations were absent: **SkillOpt already contained `plugins/dsh`**, correcting an earlier web-search-only assessment. Its inspected integration wrapped a Python CLI as model tools and did not establish this project's native observation, Web review, executable-Skill isolation, full accounting, or two-stage authorization.

Six main projects were traced through core call chains, with targeted Hermes/DGM comparisons. Shallow checkouts were placed under `/private/tmp/deepseek-rsi-source-review-20260907/`. Dependencies, Agents, models, containers, and schedulers were not run. Tests were read, not executed. Every finding is limited to the pinned path/commit, not a blanket security or capability claim.

## 2. Pinned revisions

| Project | Commit | Reviewed scope |
|---|---|---|
| EvoSkill | 36f6f04952293d7054145550c2b9f0b0411bff1c | Loop, proposal/generation, Git versions, scoring, costs |
| SkillOpt | 79124b37e9a6371e13b753f8bcd7adb1e493ade1 | Sleep cycle, validation, adoption transactions, budget, DSH plugin |
| Memento-Skills | ee9b9a45efd093d669c06fe318b4b1dceb246d19 | Attribution, rewriting, tests, deployment/rollback |
| retro-skill | 72e03f250ec6b7b87c31548e899ef6eb5c157851 | Mechanical signals, proposals, reminder hooks, approval instructions |
| GEPA | 0632cdb5dcc052e690eab439e1b4a7e3e9cfe407 | Acceptance/selection, evaluation budgets, reflection accounting |
| Janus | f7c72d0ff082897a366f28ee79d25cd4888620a4 | Evaluation, approval, promotion, isolation |
| Hermes | 22c5684b983eac6a81ee015ae80296c4b3dbf5bb | Skill writes, staging approval, write ledger |
| DGM | a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2 | Parent selection, candidate archive, diagnosis/evaluation |
| DeepSeek Harness | d347e703908d0406b7a7ef80e3a0e594d86b2215 | Actual local plugin/storage/Skill/usage/retry APIs |

Pinned repository and file links are retained in the source index below. Temporary clones are research material, not runtime dependencies.

## 3. EvoSkill: Candidate loop, not live-directory branch switching

Call chain: CLI/API → SelfImprovingLoop.run → baseline evaluation → training samples → failure collection → proposer → generator → ProgramManager candidate commit → validation → frontier → feedback/checkpoint.

Useful ideas: baseline before changes; separate why/how feedback; parent/version/score/content provenance; independent generation and evaluation.

Limits in the inspected code:

1. update_frontier accepts into a non-full pool, or when exceeding its worst member. added=True does not prove improvement over parent/baseline, yet resets no-improvement counting. The historical RSI design instead used a frozen objective contract.
2. switch_to uses Git checkout and automatic stash/apply, suitable for offline experiments but conflicting with daily readers. RSI uses independent immutable copies and separates ACTIVE from references.
3. All-passing samples skip proposals; that cannot serve a user who wants an already-correct answer shorter or cheaper.
4. `_total_cost` accumulation occurs after early continue/break paths that can skip that round's accumulation. Checkpoints mainly store sampling position, not a complete request ledger. This was a static finding, not a reproduced runtime result. RSI accounts for every attempt lifecycle.
5. Keep failed candidates/evidence rather than treating branch deletion as audit retention.

## 4. SkillOpt-Sleep: Review and writeback reference

Call chain: run_sleep_cycle → harvest_for_config → task mining/frozen split → consolidate → train reflection/bounded edits → validation gate → fresh final validation → staging → separate adopt.

Useful ideas:

- Separate train/val/test; mark leaked splits and reject missing/nonfinite score evidence in task deltas.
- Fresh final replay after intermediate acceptance, correcting applied/rejected edit records on failure.
- Staging binds canonical source paths, original byte hashes, and candidate hashes. adopt/adopt_skills reread under a lock, verify hashes, handle duplicate adoption, and reject stale content.
- `.adopt-transaction.json`, backups, receipts, and recovery are useful for future multi-file source export. One os.replace alone does not provide equivalent recovery.
- test_gate_no_regression.py expresses useful intermediate/final regression, missing-result, and nonfinite-score cases; it was not run.

Differences:

- The core gate requires strict score improvement; defaults are gate_metric=mixed and gate_no_regression=false. The historical RSI plan separated mandatory correctness from user objectives; today's policy instead uses compilation and user selection.
- test_fraction defaults to 0.0, so an independent final test set is not a default guarantee. Clarify which held-out checks actually block adoption.
- Staging mainly targets Markdown, not a complete Python/Shell Skill version system.
- max_tokens_per_night is defined and budget.py has a budget class, but the repository search found no standard-cycle enforcement of that configuration field. A hard token cap was not established.
- auto_adopt is optional upstream; RSI's first version does not enable automatic adoption.

### 4.1 Existing DeepSeek Harness plugin

plugins/dsh/src/index.js registers seven tools and uses ctx.shell.resolve/run to launch the Python CLI; package.json declares its bundle patch.

| Area | Inspected fact | Implication |
|---|---|---|
| Tools | status/dry-run/run/adopt/harvest/schedule/unschedule | Tool registration/packaging already exists |
| Harness logs | No dsh source in source enum or harvest_sources.py | Calling inside DSH does not establish learning from DSH sessions |
| Models | Python backend/external CLI, not plugin ctx.llm | Native RSI request accounting does not follow automatically |
| Approval | Model-callable adopt; inspected execute did not bind user, candidate digest, and scope | Generic tool permissions do not replace exact RSI task/adoption authorization |
| Web | No dsh.client declaration or panel registration | RSI review UI still needed |
| Execution | Host shell wrapper with signal/timeout | Does not prove networkless Docker candidate execution |
| Usage | Collected stdout/stderr, no observed per-request realtime usage events | Accounting needs explicit integration |
| Scheduling | Nightly cron install/removal | Outside task-authorized first-version scope |
| Canary | Real package with rc.8-shaped fake shell | Wrapper/argument test, not current alpha.1 end-to-end evidence |

Do not install this wrapper and delegate uncovered requirements to Skill prose. A separate compatibility experiment could be useful later; it is not a runtime dependency here.

## 5. Memento-Skills: File repair and failure attribution

Call chain: dispatcher → gateway.evolve_failure → SkillEvolutionEngine → attribute → evolve attributed Skill → copytree → rewrite/replacements → static/unit/synthetic tests → best candidate → replace/rollback. Evolution is disabled by default in the inspected configuration.

Useful: attribution only among real candidate Skills, bounded replacements, stable Skill identity, separate failed candidates/backups/events, and a per-Skill in-process lock.

Changes needed for this project:

- `_static_and_unit_tests` runs host sys.executable -m pytest in candidate cwd. Another cwd does not restrict HOME/network/subprocess access. Candidate scripts/tests need the controlled execution boundary.
- The rewrite model proposes synthetic_test/pass_criteria, and local tests sit inside editable Skill directories. They can test hypotheses, not be the sole trusted evaluator. Host-owned frozen checks cannot be edited by candidates.
- Best-test candidate deployment does not provide separate user adoption after comparison.
- Moving source to backup then candidate to source is two operations. Exception recovery does not eliminate a hard-crash gap. RSI activates by database pointer; source writeback needs separate recovery validation.
- Model attribution confidence is advice, not a calibrated probability or editing permission.

The referenced engine test file was read only.

## 6. retro-skill: Small, explainable opportunity detection

The mechanical detector extracts tool errors, retry clusters, large output, repeated reads, user corrections, and similar commands, then uses model classification. Its Skill organizes analysis, proposals, item-by-item approval, and source edits. The session-end hook is off by default and only reminds users to review, without a model call.

RSI borrows five signal families: nonzero script exits, repeated attempts, repeated file reads, excessive/repeated output, and explicit brevity/cost preferences. Signals only suggest investigation; retain event references and possible credential/environment/task causes.

Do not copy unrelated branch/attribution/PR/cross-project conventions. Upstream approval is largely expressed as Skill procedure; RSI enforces it at host state transitions. The archived predecessor Coach's proposal-backlog report motivates deduplication, cooldown, caps, and ignore feedback, not abandoning the user's local-observation requirement.

## 7. GEPA: Optional future search, not product authority

The engine combines reflection, acceptance, candidate selection, and validation. Strict improvement is default, with tie-acceptance strategies available. Its accepted state cannot map directly to READY_FOR_USER.

oa/budget.py limits evaluation calls, leaving proposal-model cost to the engine. Cost documentation notes callable token counts can be character estimates and cost can be zero; that zero does not establish free execution.

The historical plan had only three serial candidates, so a simple best-so-far loop was preferred over GEPA/DSPy, Pareto/frontier search, or multiple proposal agents. Consider such a generator only after a fixed dataset demonstrates a need; host accounting/checks/adoption remain authoritative. Automatic search is not in the current g2.5 flow.

## 8. Janus: Useful approval structure, different gates

self_improve.py offers propose → record_evaluation → approve → can_promote → promote → rollback. Promotion checks evidence, scope, history, health, cost, and human approval. Reevaluation resets approval state.

The evaluator copies skills/evals to a temporary home and sets an override; that function alone does not prove OS isolation. `_compute_gate` permits configured mean-score epsilon and uses specific pass-rate decline ranges, not the historical RSI nondecreasing-accuracy rule.

Borrow rechecking at adoption and review after evidence. Do not import the entire health/governance platform, progressive approval bypass, or shaped reward as a correctness substitute.

## 9. Hermes and DGM

Hermes skill_manager_tool.py supports create/edit/patch/write_file/remove_file, staging approval, and before/after ledgers; it is not merely memory accumulation without approval. In the inspected path, `_run_write_gate` returns None if the approval module cannot import, allowing continuation. RSI must fail closed when authorization is unavailable. This targeted finding is not a complete Hermes bypass audit.

DGM selects parents and retains an exploration archive; self_improve_step diagnoses failures, modifies code, and evaluates. Full lineage and diagnosis are useful, but whole-Agent rewriting/open-ended archive search exceed the first version.

## 10. Historical design decisions from this review

| Topic | Decision at the review date |
|---|---|
| Packaging | Independent repository/native package; dsh-skillopt is a comparison, not the complete required product |
| Observation | Local signals, deduplication/cooldown, clicked analysis; no other Agents' entire histories |
| Edit scope | SKILL.md plus authorized scripts/references, independent copies, no live branch switching |
| Acceptance | Separate correctness/user objectives; allow equal correctness with better brevity, no masking regression with mixed scores |
| Tests | Candidate/synthetic tests supplementary; host-owned frozen evaluator authoritative |
| Search | One Skill and one globally executing optimization, at most three serial candidates; no frontier platform |
| Storage | Native storage-domain has no cross-table transaction API; use one plugin SQLite for coherent permissions/versions/accounting |
| Usage | Persist per attempt, exclusive daily/RSI owners, unknown not zero, settle early-exit paths |
| Adoption | Separate Web action binding content/report digests and expected ACTIVE; new sessions use the new version |
| Source overwrite | G5 only, with hashes/locks/recovery/conflict checks, not automatic adopt |
| Cleanup | Stop test-owned hosts/containers; no nightly daemon/cron |

These are historical decisions; current compilation/user-choice and iteration contracts supersede the scoring/search rows.

## 11. Reuse and next step

No third-party implementation was copied or runtime dependency added in this review. If substantial source is copied later, preserve LICENSE, NOTICE, and file headers from the actual revision; retro instructions/scripts may have different licenses.

The historical next step was G0: native package installation, Web channel, pinned Skill/session binding, actual request attribution, and Docker call/cancellation/cleanup. A mock demo of another wrapper does not prove this project's controlled RSI or model improvement.

## Pinned source index

All original source links are retained below for reproduction. These links identify the historical evidence; they are not claims of a fresh upstream review.

- [sentient-agi/EvoSkill / pinned repository](https://github.com/sentient-agi/EvoSkill/tree/36f6f04952293d7054145550c2b9f0b0411bff1c)
- [microsoft/SkillOpt / pinned repository](https://github.com/microsoft/SkillOpt/tree/79124b37e9a6371e13b753f8bcd7adb1e493ade1)
- [Memento-Teams/Memento-Skills / pinned repository](https://github.com/Memento-Teams/Memento-Skills/tree/ee9b9a45efd093d669c06fe318b4b1dceb246d19)
- [netresearch/retro-skill / pinned repository](https://github.com/netresearch/retro-skill/tree/72e03f250ec6b7b87c31548e899ef6eb5c157851)
- [gepa-ai/gepa / pinned repository](https://github.com/gepa-ai/gepa/tree/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407)
- [magnetoid/janus / pinned repository](https://github.com/magnetoid/janus/tree/f7c72d0ff082897a366f28ee79d25cd4888620a4)
- [NousResearch/hermes-agent / pinned repository](https://github.com/NousResearch/hermes-agent/tree/22c5684b983eac6a81ee015ae80296c4b3dbf5bb)
- [jennyzzt/dgm / pinned repository](https://github.com/jennyzzt/dgm/tree/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2)
- [B1ackB/deepseek-harness / pinned repository](https://github.com/B1ackB/deepseek-harness/tree/d347e703908d0406b7a7ef80e3a0e594d86b2215)
- [sentient-agi/EvoSkill / src/cli/commands/run.py](https://github.com/sentient-agi/EvoSkill/blob/36f6f04952293d7054145550c2b9f0b0411bff1c/src/cli/commands/run.py)
- [sentient-agi/EvoSkill / src/loop/runner.py](https://github.com/sentient-agi/EvoSkill/blob/36f6f04952293d7054145550c2b9f0b0411bff1c/src/loop/runner.py)
- [sentient-agi/EvoSkill / src/registry/manager.py](https://github.com/sentient-agi/EvoSkill/blob/36f6f04952293d7054145550c2b9f0b0411bff1c/src/registry/manager.py)
- [microsoft/SkillOpt / skillopt_sleep/cycle.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/cycle.py)
- [microsoft/SkillOpt / skillopt_sleep/consolidate.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/consolidate.py)
- [microsoft/SkillOpt / skillopt_sleep/staging.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/staging.py)
- [microsoft/SkillOpt / skillopt_sleep/config.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/config.py)
- [microsoft/SkillOpt / tests/test_gate_no_regression.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/tests/test_gate_no_regression.py)
- [microsoft/SkillOpt / plugins/dsh/src/index.js](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/plugins/dsh/src/index.js)
- [microsoft/SkillOpt / plugins/dsh/package.json](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/plugins/dsh/package.json)
- [microsoft/SkillOpt / skillopt_sleep/harvest_sources.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/harvest_sources.py)
- [microsoft/SkillOpt / plugins/dsh/scripts/canary.mjs](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/plugins/dsh/scripts/canary.mjs)
- [Memento-Teams/Memento-Skills / core/skill/evolution/engine.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/core/skill/evolution/engine.py)
- [Memento-Teams/Memento-Skills / core/skill/gateway.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/core/skill/gateway.py)
- [Memento-Teams/Memento-Skills / shared/schema/skill_config.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/shared/schema/skill_config.py)
- [Memento-Teams/Memento-Skills / core/skill/tests/evolution/test_engine.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/core/skill/tests/evolution/test_engine.py)
- [netresearch/retro-skill / skills/retro/scripts/detect-mechanical.py](https://github.com/netresearch/retro-skill/blob/72e03f250ec6b7b87c31548e899ef6eb5c157851/skills/retro/scripts/detect-mechanical.py)
- [netresearch/retro-skill / skills/retro/SKILL.md](https://github.com/netresearch/retro-skill/blob/72e03f250ec6b7b87c31548e899ef6eb5c157851/skills/retro/SKILL.md)
- [netresearch/retro-skill / hooks/session-end.json](https://github.com/netresearch/retro-skill/blob/72e03f250ec6b7b87c31548e899ef6eb5c157851/hooks/session-end.json)
- [gepa-ai/gepa / src/gepa/core/engine.py](https://github.com/gepa-ai/gepa/blob/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407/src/gepa/core/engine.py)
- [gepa-ai/gepa / src/gepa/oa/budget.py](https://github.com/gepa-ai/gepa/blob/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407/src/gepa/oa/budget.py)
- [gepa-ai/gepa / docs/docs/guides/cost-tracking.md](https://github.com/gepa-ai/gepa/blob/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407/docs/docs/guides/cost-tracking.md)
- [magnetoid/janus / agent/self_improve.py](https://github.com/magnetoid/janus/blob/f7c72d0ff082897a366f28ee79d25cd4888620a4/agent/self_improve.py)
- [magnetoid/janus / agent/eval_orchestrator.py](https://github.com/magnetoid/janus/blob/f7c72d0ff082897a366f28ee79d25cd4888620a4/agent/eval_orchestrator.py)
- [NousResearch/hermes-agent / tools/skill_manager_tool.py](https://github.com/NousResearch/hermes-agent/blob/22c5684b983eac6a81ee015ae80296c4b3dbf5bb/tools/skill_manager_tool.py)
- [jennyzzt/dgm / DGM_outer.py](https://github.com/jennyzzt/dgm/blob/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2/DGM_outer.py)
- [jennyzzt/dgm / self_improve_step.py](https://github.com/jennyzzt/dgm/blob/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2/self_improve_step.py)
