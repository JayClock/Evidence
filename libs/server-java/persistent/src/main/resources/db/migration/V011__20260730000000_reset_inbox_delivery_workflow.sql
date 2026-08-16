-- MVP authority reset: no legacy Inbox, Iteration, Story, Scenario, or
-- CodingRun data is imported into the unified Inbox -> Kickoff lifecycle.
-- Workspace, membership, diagram, and logical-model data remain intact.
TRUNCATE TABLE
  "activity_runs",
  "coding_runs",
  "story_scenarios",
  "story_revision_citations",
  "story_revisions",
  "story_card_revisions",
  "problem_statement_revisions",
  "stories",
  "kickoff_decisions",
  "kickoff_proposals",
  "iteration_intakes",
  "iterations",
  "inbox_candidate_decisions",
  "inbox_story_citations",
  "inbox_story_candidates",
  "inbox_extraction_sources",
  "inbox_extractions",
  "inbox_revisions",
  "inbox_items",
  "workspace_sequences"
CASCADE;
