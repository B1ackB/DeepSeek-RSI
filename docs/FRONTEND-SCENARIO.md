# Frontend Design Scenario and Preference Boundaries

Current comparison and iteration rules are in [EXTENSION-CONTRACTS.md](EXTENSION-CONTRACTS.md). Since 2026-09-13, compilation and user choice govern adoption; web design is one extensible scenario.

[Documentation](README.md) · [Development rules](../AGENTS.md)

The following records the 2026-09-08 product decisions and g2.0–g2.3 progression. g2.3 added combined preference/budget confirmation, independent generation/checks, separate adoption, and ordinary-task handoff; see [MAINFLOW-REPORT.md](MAINFLOW-REPORT.md) for SQLite 5 and evidence. Its development did not upgrade the user's running profile or authorize new paid calls.

The user selected frontend design as the first full scenario, with repository analysis, logs, and test diagnosis later. The goal is to start from an initial design Skill, improve it from feedback, and ask a small number of questions to establish preferences. Lightweight questions and project memory were confirmed, including limits, scope, and conflict handling. Early preparation implemented fixed questions, preferences, frozen context, and one analysis, not arbitrary chat/screenshot interpretation, semantic conflict detection, candidate editing, or output comparison.

The later [direct revision flow](G2-CONTRACTS.md#preference-driven-independent-revision) sends preferences and the current Skill to a separate model after one card confirms editable scope and budget. Checks and separate adoption occur before the ordinary page task begins.

## 1. Proactive questions

The historical g2.2 entry uses normal chat and a native enrollment question before frontend writing. Enrollment applies to the current task, carries through continuous same-session edits, and asks again for a new session or after manual end. It authorizes observation only. The newer combined card moves preference/edit confirmation into the main flow without granting old records new permissions.

Use lightweight questioning for important missing preferences, explicit dissatisfaction, or conflicting confirmed requirements:

- At most three questions per batch and two proactive batches per optimization task. A comparison review does not implicitly authorize another revision or adoption.
- Color, density, typography, shape, imagery, and motion remain examples and historical form dimensions. New natural-language input is not confined to these six categories; do not ask every dimension every time.
- Do not repeat still-valid answers. Identify concrete conflicts rather than overwriting silently. At the question limit, unresolved critical conflicts wait for user action rather than guesses.
- Allow selection, free text, no preference, skip, and closing proactive questions. Silence/skip is not consent. Optional aesthetics may use explicitly shown temporary defaults; pause only dependent work when required content/interaction is unresolved.
- Use the sidebar without forced dialogs or stealing chat focus. Do not turn daily feedback into a Skill preference before the task and managed Skill are bound.

### Questions versus model calls

Local rules can choose fixed questions from known input/state without a model. Fixed comparison forms also need no call. Personalized clarification, free-text/reference-image interpretation, and generation can require model requests and therefore prior scope/budget confirmation.

A response may contain several questions; processing subsequent answers is another request. Question count is not request count. Follow-up calls consume the same authorized budget and retain analysis/generation/evaluation attribution. A one-call G1 analysis cannot become an unlimited interview.

Answering, saving a preference, or selecting a preferred page is not edit/adoption authorization. Submitting the combined card explicitly grants the displayed revision scope/budget; adoption remains separate. While waiting, do not dispatch dependent calls, leave candidate processes idle, or extend deadlines automatically.

## 2. Preference scope

| Scope | Applies to | Example | Persistence |
|---|---|---|---|
| Current page/task | This request | Red for this event page; no motion this time | Temporary by default |
| Project (confirmed default persistent scope) | Later design work in the registered workspace | Light theme here; compact admin pages | Explicit scoped form; may express page-type conditions |
| Personal default | Frontend defaults in other projects | Usually fewer rounded corners; avoid strong motion | Explicit selection only, never promoted from repeated choices |

Project memory means confirmed scoped preferences, not permanent storage of every message. Ambiguous scope starts as a current-task signal. RSI manages these frontend preferences; it does not alter other apps or Codex memory.

For an applicable dimension: current explicit requirement → project preference → personal default → base Skill default. Inapplicable page conditions do not merge. Required content, project constraints, and frozen checks remain mandatory; aesthetics cannot cancel them silently.

For example, a light project overrides a dark personal default without deleting that default. Red for one event page changes only that task.

Users can inspect, edit, disable, or remove preferences. Changes affect later work; active optimization retains its confirmed snapshot. Applying new preferences to an ongoing task requires pausing affected work and rechecking authorization/comparison conditions. Old results retain their original context.

## 3. Skill and acceptance boundaries

The initial Skill should understand purpose, read applicable preferences, ask necessary questions, design layout, generate a usable page, and check delivery. It need not contain every style or deliberately weak baseline behavior.

Preferences and Skill procedures are versioned separately. Explicit authorized preference edits can directly generate candidates without repeated failures. Models may explain why no edit is needed but cannot fabricate a new version. Unadopted candidates preserve the baseline; users choose baseline continuation or stop. Shared global defaults cannot bypass project scope.

The user confirmed candidate checks/adoption before the first page request. A session that already used the old Skill gets a linked session with current requirements/preferences and no old Skill instructions. Original bindings remain. This is a continuation of the same task, while independently started tasks reconfirm.

Candidates edit only authorized Skill text, templates, and scripts. Pages are outputs/evidence. Fixed checkers, requirements, feedback, budgets, and ACTIVE are not writable by candidates.

Compare pages under the same task, preference snapshot, and execution conditions. Since 2026-09-13, compilation enables user choice without functional/aesthetic scoring. The sidebar shows previews, links, tokens, and time; the user chooses a version or provides further requirements.

A choice reflects that instance's preference, not general capability improvement. Count complete artifact requests, not just final-answer length. New requirements create a new task and comparison under new conditions; do not mix measurements from different conditions.

## 4. Inputs still requiring execution-time decisions

- Question limits, scope, combined authorization, adoption-before-task, linked sessions, and manual fallback choices are confirmed; executable fields and controlled checks evolve per stage.
- The initial sample assumption was a fictional landing page in HTML/CSS/vanilla JavaScript without online images/fonts; it was not a confirmed user selection at that time. Keep the initial Skill stack-neutral and freeze paths/checks before candidate execution.
- The current flow uses user-started iterations with separate scope/budget confirmation, not unlimited background execution. Automatic search remains in the historical framework.
- Confirm actual model route, input, request/output caps, and batch budget before real execution. This document adds no spending permission.
