---
description: Start or run Evidence Workflow requirement discovery from a GitHub Issue
argument-hint: '--issue=123 [--repo=owner/evidence]'
---

Requirements are not maintained in a local seed document. If no active iteration exists, use `evidence_workflow_start_from_issue` with the explicitly supplied GitHub Issue. The workflow freezes `00-user-input/issue.json` and generates a read-only `requirements.md` projection.

Then inspect status and run the current `frame`, `clarify`, `specify`, or `validate` phase through `evidence_workflow_phase_prompt`. Never edit the generated requirement projection; update the Issue and explicitly sync while still in frame, or start a new iteration.
