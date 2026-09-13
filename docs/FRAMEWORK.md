# Current DeepSeek RSI Framework

Updated 2026-09-13. This document describes the current product direction. The previous design is [archived](HISTORY-FRAMEWORK-G2.4.md); implementation and validation are recorded in the [delivery report](COLLABORATION-REPORT.md).

## Purpose and editable scope

Provide user-directed Skill evolution inside DeepSeek Harness. The editable object is one authorized directory-backed Skill: SKILL.md, text references, and Python/Shell helpers. Webpages and text are outputs used to choose a version. Model weights, controllers, compilers, authorization, and budgets are outside candidate scope.

## Decision ownership

| Decision | Owner |
|---|---|
| Requirements, preferences, and scope | User |
| Skill rewrite and necessary clarification | Model |
| Input, paths, budgets, versions, and compilation boundaries | Host |
| Whether to adopt or iterate again | User |

Functional, aesthetic, or aggregate quality scores do not replace user choice. The technical threshold is scenario-specific compilation/format validation. File scope, version integrity, and trustworthy usage remain execution constraints. Tokens and time inform comparison; neither triggers a version switch.

## Main flow

Request → recognize scenario → confirm requirements/scope/budget → generate independent candidate → validate files → optional output comparison → user choice.

The user can adopt, keep the baseline, or select a reference version and add requirements in the sidebar. Another iteration creates a task with `parentId`, preserving the previous candidate, authorization, usage, and comparison. It returns to confirmation; feedback alone does not call a model.

Each comparison freezes requirements, preferences, complete Skill files, scenario version, and model settings. Each side receives one tool-free request, followed by compilation and artifact sealing. Links and measurements are shown separately. A later iteration does not reuse results obtained under different conditions to imply a fair comparison.

Adoption is a separate action. Task scope does not change project defaults; project scope changes only that project's active version. A previously bound session cannot switch versions in place; the host creates a linked session when needed. Source directories remain unchanged by default.

## Extensible architecture

One plugin package separates the shared host flow from scenario modules. Web and general text are built-in scenarios. A new scenario supplies metadata, recognition functions, output instructions, and compilation, reusing the ledger, version switching, and sidebar.

See [architecture](ARCHITECTURE.md) and [contributing](CONTRIBUTING.md) for responsibilities and examples.

## Current boundaries

- Comparison is one tool-free model request per side with the complete Skill. Ordinary tasks still run through the native Harness Agent.
- Web comparison produces a self-contained HTML/CSS/JavaScript page, not a multi-file project build. Text comparison does not read external repositories and should state when supplied information is insufficient.
- A managed Skill contains at most 32 regular UTF-8 files. Symlinks, special files, unauthorized paths, and empty candidates are rejected. Fixed Docker checks validate script syntax without running candidate scripts on the host.
- Default generation budget: at most 3 requests, 4096 output tokens each, a 32000 confirmed-token stop threshold, and 5 minutes. These bound generation/clarification, not automatic optimization rounds.
- Default comparison budget: 2 requests, 8192 output tokens each, a 64000 confirmed-token stop threshold, and 10 minutes. Users can lower limits before confirmation; the output cap can be raised to at most 16384. Product limits are not development spending authorization.
- Iterations are user-started linked tasks. The historical automatic three-round search and two-round no-progress stop policy are not implemented capabilities or current requirements.
- Requests are not automatically replayed. Unknown usage is not zero; failures and interruptions remain recorded. Persistent arrays have explicit capacities and fail when full instead of discarding history.

## Next steps

1. Validate the new comparison UI with a separately authorized real batch across different preferences and outputs.
2. Add concrete needed scenarios, such as structured reports, code explanation, or controlled project builds, before broadening execution permissions.
3. Improve multi-round history, explicit rollback, and source-directory export/recovery.
4. Test clean installation and additional host combinations; settle licensing, release procedures, and interface compatibility.

These are future tasks, not claims that the package is already a general RSI platform.
