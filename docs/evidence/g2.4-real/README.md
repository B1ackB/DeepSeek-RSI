# g2.4 Real Design Comparison Evidence

Historical conclusion: real Skill revision, host validation, separate digest approval, and native page generation were connected. The candidate's additional signup button produced no feedback, so it failed the historical quality check and was not recommended for source overwrite. See the [report](../../LIVE-GUIDANCE-REPORT.md). The later compilation/user-choice policy does not rewrite this experiment's conclusion.

## Pages and Skills

| Artifact | Baseline | Candidate |
|---|---|---|
| Complete page | [HTML](baseline-page.html) | [HTML](candidate-page.html) |
| Desktop screenshot, 1440px | [Screenshot](baseline-page-1440.png) | [Screenshot](candidate-page-1440.png) |
| Mobile screenshot, 390px | [Screenshot](baseline-page-390.png) | [Screenshot](candidate-page-390.png) |
| Actual Skill input | [Before](skill-before.md) | [Model candidate](skill-after.md) |
| Page-generation tokens | 14875 | 5252 |

Pages preserve original model output except outer Markdown code fences; generated code was not repaired. Skills preserve original content/format. These are fictional concept demos, not real registration services. Original Skill text, confirmed inputs, outputs, JSON records, and screenshots deliberately retain their source language and exact bytes; translating them would invalidate the evidence manifest.

## Evidence chain

1. [Confirmed input and scope](confirmed-input.json): complete requirements, preference, editable files, task scope, authorization digest.
2. [Request/version comparison](comparison.json): identical non-Skill input/settings; approved and actual Skill match; source unchanged.
3. [Real request ledger](calls.json): four calls including the initial clarification, totaling 23830 provider-confirmed tokens. reasoningTokens is included in outputTokens; do not add it twice.
4. [Browser checks](page-checks.json): required structure/interactions passed; extra candidate submit button failed, making the candidate fail overall. Baseline passed this fixed sample. No full accessibility audit or multi-sample statistics.
5. [Final integrity and resources](final-integrity.json): old requests/business data retained, new usage settled, services stopped.
6. [Manifest](manifest.json): versions, test method, and SHA-256 for each evidence file.

Offline reproduction: copy this directory to a cache first, then run `node scripts/check-live-pages.mjs <copied-directory>` from the repository root. The script rewrites screenshots/check results and is expected to exit with failure for the known candidate interaction issue. It needs local Chrome and Playwright from the pinned Harness checkout, but makes no model calls. Do not overwrite the original evidence to manufacture a pass.
