---
name: evidence-change-explanation
description: Create a rich, self-contained HTML explanation of one stable Evidence Story diff after every Pair quality gate passes and before human coding approval. Use for the isolated Change Explainer or when the user explicitly asks for the Pair approval-ready code change to be explained; do not use while the diff is still changing, for code review, or for Showcase value observation.
---

# Evidence Change Explanation

## Purpose

Help a human understand an approval-ready Story increment without turning a narrative explanation into execution evidence or approval authority. The deterministic manifest proves what ran; this HTML explains how the surrounding system and stable diff fit together.

## Preconditions

Proceed only when the task provides all of the following:

- one Story and its complete confirmed Scenario Set;
- a Pair Git baseline and current HEAD;
- a generated execution manifest and deterministic summary;
- a controller-selected `.html` output path outside the repository;
- Pair checkpoint `quality_gates_passed` with no automation exception.

Stop if the diff or hashes drift, the output path is inside the repository, or the task asks you to approve, repair, test, or change code.

## Exploration

1. Read the confirmed Scenarios, modeling evidence, approved plan, manifest, and summary before interpreting code.
2. Inspect the baseline-to-worktree diff under `apps/` and `libs/` with read-only Git commands.
3. Read enough unchanged surrounding code to explain entry points, boundaries, data flow, domain responsibilities, and tests. Prefer repository-relative paths and concrete example data.
4. Separate three kinds of statements:
   - observed execution facts from the manifest;
   - intended behavior and value from confirmed Scenarios;
   - explanatory interpretation of the code.
5. Never describe intended value as observed product value; that belongs to Showcase.

Do not read secrets, `.env` files, credentials, generated dependency trees, or unrelated personal data. Do not run tests, builds, servers, formatters, package installation, or commands that mutate Git or files.

## Explanation structure

Write one long page with a table of contents and these exact section IDs:

1. `background`
   - Begin with a beginner-friendly view of the relevant system.
   - Narrow to the modules, domain concepts, runtime boundaries, and existing behavior touched by this Story.
   - Make the broad introduction easy for experienced readers to skip.
2. `intuition`
   - Explain the essential idea before implementation details.
   - Use small toy data derived from, but clearly distinguished from, confirmed business data.
   - Reuse a small number of visual diagram families.
3. `code`
   - Walk through the change in a comprehensible order rather than raw file order.
   - Group tests, production behavior, adapters, model changes, and cross-cutting effects when applicable.
   - Cite repository-relative paths and distinguish changed code from unchanged context.
   - Include the manifest-backed Red/Green/Refactor and quality-gate facts without inventing commands or results.
4. `quiz`
   - Include exactly five medium-difficulty multiple-choice questions that test understanding of this specific Story change.
   - Avoid trivia and gotchas.
   - Give immediate correct/incorrect feedback and a short explanation when an option is selected.

Use clear, progressive technical prose, concrete examples, smooth transitions, and concise callouts for definitions, invariants, risks, and edge cases.

## HTML contract

Create a single responsive HTML document with inline CSS and JavaScript only.

- Start with `<!doctype html>` and include semantic `header`, `nav`, `main`, and `section` elements.
- Add `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">` so opening the local file cannot load network resources.
- The table of contents must link to `#background`, `#intuition`, `#code`, and `#quiz`.
- Draw diagrams with accessible HTML/CSS boxes, lists, arrows, and labels. Do not use ASCII diagrams, remote renderers, canvas libraries, or external assets.
- Put code in `<pre><code>` blocks. Define a `pre { white-space: pre-wrap; ... }` or `pre { white-space: pre; ... }` rule so source formatting survives.
- Keep contrast, focus states, touch targets, reduced-motion preferences, heading order, and phone layouts usable.
- Do not load scripts, stylesheets, fonts, images, frames, or other resources from the network.
- Do not embed repository absolute paths, secrets, hidden chain-of-thought, or raw unbounded command output.

Use this quiz markup contract exactly five times so the controller can validate the file:

```html
<article class="quiz-question" data-quiz-question>
  <h3>Question</h3>
  <button type="button" class="quiz-option" data-correct="false">Option</button>
  <button type="button" class="quiz-option" data-correct="true">Correct option</button>
  <p class="quiz-feedback" data-quiz-feedback aria-live="polite"></p>
</article>
```

Attach inline JavaScript with `addEventListener` to every option. When selected, mark the option, disable or otherwise stabilize that question's choices, and populate its `data-quiz-feedback` element with whether the answer was correct and why.

## Output boundary

Write exactly one file: the controller-provided external `.html` path. Do not create drafts, screenshots, Markdown companions, metadata, or repository files. Re-read the completed file and verify:

- all four sections and table-of-contents links exist;
- diagrams are HTML/CSS rather than ASCII;
- every code block preserves whitespace;
- there are exactly five interactive quiz questions with feedback;
- no external dependency remains;
- claims about execution and value retain their proper evidence boundary.

Then report the output path and stop. The human still decides whether to approve the Story coding evidence.
