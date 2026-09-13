# G0 Integration and First Validation Batch

[Documentation](README.md) · [Development rules](../AGENTS.md)

Date: 2026-09-08. Historical scope: integration prototype and controlled probes, not the G1–G5 optimization cycle. Development used ponytail full and tabs.

## Conclusion

An independent host/Web plugin can persist controlled state, pin worker Skill versions, reject host tools, and account for normal requests, tool round trips, and native summarization without changing the pinned Harness Agent Loop. Native retries were exercised with fixed local provider responses.

The follow-up display test measured fixed provider usage through production accounting, HTTP, and Chrome rendering. Upper bounds from usage emission to screenshots containing the corresponding rows were 137, 76, and 86 ms, all below one second. This supersedes HTTP-marker latency alone as UI evidence; it is a controlled local measurement, not a DeepSeek online latency guarantee.

## Environment and delivery

- Harness `d347e703908d0406b7a7ef80e3a0e594d86b2215`, 0.1.3-alpha.1; source unchanged in G0.
- `@b1ackb/deepseek-rsi@0.0.0-g0`: one TypeScript package, host ESM and Harness client-factory format.
- `/opt/homebrew/bin/node` 25.8.1; TypeScript 6.0.3, esbuild 0.28.2, Zod 4.4.3. Exact dependencies are in package-lock.json.
- Harness declares pnpm 11.7.0; native plugin management resolved pnpm 11.19.0 from PATH. Global Node was not changed.
- OrbStack 2.2.3 (20963), user-approved terms/initialization, Docker Server 29.4.0 arm64. No login startup, Kubernetes, or extra Linux machine.
- Credentials reused `DSH_HOME=/Users/black/.dsh-rsi-dev`; no keys or browser tokens in code, reports, or packages.

## Evidence matrix

| Check | Evidence | Limit |
|---|---|---|
| Web state | Marker survived refresh/restarts; authenticated HTTP passed | Native auth/RPC, no separate server |
| Input boundary | No cookie: 401; foreign Origin: 403; unknown fields, stale revisions, conflicting operation IDs rejected | Not full product authorization |
| Notification/rendering | Marker HTTP 4–5 ms; usage-to-screenshot 137/76/86 ms | Includes RPC, DOM checks, compositing; no equivalent online-stream measurement |
| Transactions/recovery | Injected receipt-write failure rolled back; restart consistent; second writer rejected | Local single-host SQLite |
| Skill identity | Session provider beat same-name global interference; corrupt pinned object did not fall back | Dedicated g0-probe only |
| Binding | Real ctx.agents.create/setup: A=v1, B=v2; disposed/resumed A remained v1; matching resources | No production ACTIVE API |
| Tools | Worker and late-registered forbidden tools rejected by guard; execution count 0 | restrict controls visibility; guard controls dispatch |
| Docker | Python/Shell, non-root, read-only root/Skill, no socket, loopback only, timeout/cancel passed | Fixed commands, not full G2 FS/Subprocess world |
| Normal calls | One daily probe and two RSI tool-round-trip requests returned usage | Registered G0 text calls only, no historical backfill |
| Summarization | One real summarizeWithLlm call correctly attributed RSI/compression | Does not establish full conversation compression commit/recovery |
| Retry | Real Agent Loop + llm-retry + fixed adapter: failure then success, each registered before dispatch, linked to retry-started | No manufactured online provider fault or paid retry |
| Duplicate/unknown usage | Duplicate usage/finish did not add cost; contradictions retained diagnostics; no-usage interruption stayed unknown and blocked further RSI calls | Not all nonstandard provider formats covered; daily work unaffected |
| Install/uninstall | Native local-tarball install/removal; tab disappeared, old POST route returned 405; reinstall/start passed | No development overlay; other Harness versions unverified |

## Paid budget and actual usage

Approved batch: at most 8 actual requests including round trips/retries/compression, V4-Flash / High, 4096 output tokens each, stop at 100000 confirmed tokens, 20 minutes including cleanup.

| Owner/purpose | Actual requests | Confirmed tokens |
|---|---:|---:|
| Daily probe | 1 | 1,432 |
| RSI tool round trip | 2 | 2,414 |
| RSI native summary | 1 | 1,180 |
| Total | 4 | 5,026 |

One additional record was not sent: the initial helper package lacked a version and failed with `REQUEST_EXTENSION / DeepSeek request extension preparation failed`. Persistent events and pinned adapter source showed failure before HTTP; the text-only probe did not use Files API. Only this record was revised to not_sent with a reason. It was not deleted, time was not reset, and usage was not fabricated. Its request reservation stayed conservatively occupied: five records total.

The daily call returned valid protocol/usage but refused the requested G0_DAILY_OK marker. It proves communication and accounting, not instruction-following success. The RSI call executed a fixed Docker tool; that is not general Skill capability evaluation.

Time from first reservation to last usage: 519,078 ms, about 8 minutes 39 seconds. After online work, containers were empty; Harness, the OrbStack VM, and app were stopped, then ports/processes verified. Later package checks only started a non-calling host.

Reasoning was not added twice to output. Missing cache fields stayed null. Totals used provider totalTokens, not answer length.

## Implementation choices and limits

1. Zod in `src/contracts.ts` derives types and validates persisted JSON. Unknown database versions fail without clearing data.
2. `src/store.ts` uses exclusive single-writer transactions and revision checks. Reserve before dispatch; stop new G0 calls after 19 minutes to leave one minute for cleanup. Restart restores no capacity and terminal state cannot become running.
3. `src/skills.ts` seals raw bytes, executable bits, and resources for controlled fixtures; read-only directories, no symlinks, 32-file/1-MiB cap. It is not yet authority to ingest arbitrary model archives.
4. `src/worker.ts` combines tools.restrict with monotonic guards. General file tools/composition need G2 validation.
5. `src/usage.ts` wraps llm/stream. Native summarization omitted reasoningEffort; only registered G0 compression calls receive the approved High value. Other route mismatches fail.
6. DeepSeek image Files API fallback may issue more HTTP inside one llm/stream. Text/script G0 probes did not use it. Image support needs provider dispatch events or explicit rejection; per-HTTP accounting for arbitrary images is not established.
7. Trusted test helpers register ownership before calls. Persistent business tasks, subcall inheritance, and historical backfill are later work. Web displays the selected daily session and RSI probe separately.
8. `scripts/host-probe.ts` is a local test overlay, excluded from the package, with no automatic paid entry. There is no budget-reset or production-activation command.

## Reproducible checks

At this historical stage, host/client strict TypeScript, build, six Node checks, diff whitespace, and tab checks passed.

- npm test: transactions, budget recovery, native Skill/Tool registries, stream merging, retries; no network/Docker.
- scripts/docker-probe.ts: lifecycle on a digest-pinned image; local Docker required.
- scripts/http-probe.mjs: authenticated RPC, persistence, long polling; no model.
- scripts/run-host-probe.mjs offline: real Agent creation/recovery without model calls.
- scripts/latency-probe.ts + scripts/browser-latency.mjs: isolated DSH_HOME, fixed adapter, production usage/RPC, 130-token row, real Chrome screenshot under one second. Build with `node scripts/build.mjs --latency`; helper excluded from package. Uses pinned Harness Playwright/local Chrome and accepts the launch-log path.
- live/compression: only under a valid specific batch; restart cannot reset it.

Initial Docker cleanup timed out. After initialization, the uniquely identified container was removed and verified. Attach timeout could return a successful exit code; AbortSignal and actual container state now determine failure, with labels used to recover owned resources. Retests passed; early failures were not counted as passes.

## Cleanup and next stage

Historical package `.cache/b1ackb-deepseek-rsi-0.0.0-g0.tgz`, SHA-1 `cf1fce24c328778eb1bb9fcdf534723b07d21115`, installed in the isolated Web profile, not npm-published. Reinstalled HTTP check passed with 5-ms notification; browser showed daily 1,432 and RSI 3,594 tokens without duplication. Marker survived; Web cancellation persisted probe revision 26.

Final checks: no 3080 listener, test Harness PID exited, OrbStack app/VM stopped, temporary browser pages closed with user pages preserved, Harness Git clean. Images, installed plugin, and history remained; no live test resources remained.

Latency follow-up used `.cache/latency-home` without altering the first ledger. Three fixture responses totaled 390 tokens and zero external calls. Timings/screenshots remain in `.cache/latency-evidence/`; the first screenshot's 130-token row was inspected. PID 69619 and port 63372 were stopped/verified; browser cleanup ran in finally.

G1 was authorized after necessary G0 follow-up: define signals, managed Skills, analysis/authorization schemas, and the main sidebar. The first online window ended; additional calls need a fresh batch and budget, never a cleared ledger.
