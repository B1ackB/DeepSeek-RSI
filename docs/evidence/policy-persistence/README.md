# Policy Persistence Gate Evidence

Date: 2026-10-15. Fixed offline responses only; paid requests: **0**.

- [check.txt](check.txt): host/client TypeScript checks, all 35 Node tests and build. Eleven persistence checks supplement the existing seven native SDK policy tests and 17 Skill/workflow checks.
- [complete.json](complete.json): one additional native SDK task with the sealed version, frozen single-run batch, runtime digest, three batch-owned requests, two trusted tool results, completed turn and verified cleanup. Usage is 45 synthetic fixture tokens, not model performance or savings.
- [verification.json](verification.json): runtime, result counts, source digests and preservation checks. Earlier gate evidence and unrelated dirty code hashes remain unchanged. The existing mainflow test differs only in its current database-version assertion.

Reproduce from the repository with Node 25.8.1 and the existing linked/pinned Harness:

```sh
PATH="/opt/homebrew/bin:$PATH" npm run check
PATH="/opt/homebrew/bin:$PATH" npm run policy:fixture
```

The migration fixture explicitly creates the old six-table v6 layout and populates historical state, terminal attempts (including uncertain diagnostic usage), both operation receipts, session/Skill bindings, managed Skills, preferences, a candidate and a completed comparison. Migration and a second open preserve all old rows byte-for-byte and leave the immutable Skill file unchanged. Corrupt legacy data rolls back the appended tables and schema version. Temporary fixture databases are deleted; no live historical database is opened.

Native tests cover 15 separate child runs, including forced-exit recovery of both the attempt and batch. The additional sample is independently owned and removed after its evidence is read. Two-side batch accounting/limits use fixed streams in a single store. A shared durable controller for paired independent child runs, fixed quality evaluation, policy generation, user adoption and restore are not established by this evidence. Cleanup is separate parent evidence; execution completion alone does not permit adoption.

The saved previous [execution gate](../policy-gate/README.md) and [feasibility experiment](../evolution-feasibility/README.md) retain their original bytes and limitations.
