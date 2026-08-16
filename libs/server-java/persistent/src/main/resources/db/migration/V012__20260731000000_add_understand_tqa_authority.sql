-- EVD-003 is a breaking workflow cutover. Existing delivery workflow rows are
-- deliberately removed rather than backfilled as authoritative TQA evidence.
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
  "iterations"
CASCADE;

CREATE TABLE "story_clarifications" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "target" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "asked_at" TIMESTAMP(3) NOT NULL,
  "answer" TEXT,
  "answered_by_user_id" TEXT,
  "answered_at" TIMESTAMP(3),
  "waived_reason" TEXT,
  "waived_by_user_id" TEXT,
  "waived_at" TIMESTAMP(3),
  "content_sha256" TEXT NOT NULL,
  CONSTRAINT "story_clarifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scenario_set_proposals" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "proposed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scenario_set_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scenario_drafts" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "proposal_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "given_steps" JSONB NOT NULL,
  "when_step" TEXT NOT NULL,
  "then_steps" JSONB NOT NULL,
  "business_data" JSONB NOT NULL,
  "content_sha256" TEXT NOT NULL,
  CONSTRAINT "scenario_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "understanding_decisions" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "proposal_id" TEXT,
  "proposal_sha256" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "selected_draft_ids" JSONB NOT NULL,
  "confirmed_scenario_ids" JSONB NOT NULL,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL,
  "content_sha256" TEXT NOT NULL,
  CONSTRAINT "understanding_decisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "story_revisions" ADD COLUMN "understanding_decision_id" TEXT;
ALTER TABLE "story_scenarios"
  ADD COLUMN "reference" TEXT NOT NULL,
  ADD COLUMN "source_draft_id" TEXT NOT NULL,
  ADD COLUMN "understanding_decision_id" TEXT NOT NULL,
  ADD COLUMN "business_data" JSONB NOT NULL,
  ADD COLUMN "confirmed_at" TIMESTAMP(3) NOT NULL;

CREATE UNIQUE INDEX "story_clarifications_iteration_id_reference_key" ON "story_clarifications"("iteration_id", "reference");
CREATE UNIQUE INDEX "story_clarifications_iteration_id_sequence_key" ON "story_clarifications"("iteration_id", "sequence");
CREATE INDEX "story_clarifications_workspace_id_iteration_id_asked_at_idx" ON "story_clarifications"("workspace_id", "iteration_id", "asked_at");
CREATE INDEX "story_clarifications_story_revision_id_idx" ON "story_clarifications"("story_revision_id");
CREATE UNIQUE INDEX "scenario_set_proposals_iteration_id_reference_key" ON "scenario_set_proposals"("iteration_id", "reference");
CREATE UNIQUE INDEX "scenario_set_proposals_iteration_id_sequence_key" ON "scenario_set_proposals"("iteration_id", "sequence");
CREATE INDEX "scenario_set_proposals_workspace_id_iteration_id_proposed_at_idx" ON "scenario_set_proposals"("workspace_id", "iteration_id", "proposed_at");
CREATE INDEX "scenario_set_proposals_story_revision_id_idx" ON "scenario_set_proposals"("story_revision_id");
CREATE UNIQUE INDEX "scenario_drafts_proposal_id_reference_key" ON "scenario_drafts"("proposal_id", "reference");
CREATE UNIQUE INDEX "scenario_drafts_proposal_id_position_key" ON "scenario_drafts"("proposal_id", "position");
CREATE UNIQUE INDEX "understanding_decisions_proposal_id_key" ON "understanding_decisions"("proposal_id");
CREATE UNIQUE INDEX "understanding_decisions_iteration_id_reference_key" ON "understanding_decisions"("iteration_id", "reference");
CREATE INDEX "understanding_decisions_workspace_id_iteration_id_decided_at_idx" ON "understanding_decisions"("workspace_id", "iteration_id", "decided_at");
CREATE INDEX "understanding_decisions_story_revision_id_idx" ON "understanding_decisions"("story_revision_id");
CREATE UNIQUE INDEX "story_revisions_understanding_decision_id_key" ON "story_revisions"("understanding_decision_id");
CREATE UNIQUE INDEX "story_scenarios_story_revision_id_reference_key" ON "story_scenarios"("story_revision_id", "reference");
CREATE INDEX "story_scenarios_source_draft_id_idx" ON "story_scenarios"("source_draft_id");
CREATE INDEX "story_scenarios_understanding_decision_id_idx" ON "story_scenarios"("understanding_decision_id");

ALTER TABLE "story_clarifications" ADD CONSTRAINT "story_clarifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_clarifications" ADD CONSTRAINT "story_clarifications_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_clarifications" ADD CONSTRAINT "story_clarifications_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_clarifications" ADD CONSTRAINT "story_clarifications_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_clarifications" ADD CONSTRAINT "story_clarifications_answered_by_user_id_fkey" FOREIGN KEY ("answered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_clarifications" ADD CONSTRAINT "story_clarifications_waived_by_user_id_fkey" FOREIGN KEY ("waived_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scenario_set_proposals" ADD CONSTRAINT "scenario_set_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scenario_set_proposals" ADD CONSTRAINT "scenario_set_proposals_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scenario_set_proposals" ADD CONSTRAINT "scenario_set_proposals_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scenario_set_proposals" ADD CONSTRAINT "scenario_set_proposals_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scenario_drafts" ADD CONSTRAINT "scenario_drafts_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "scenario_set_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "understanding_decisions" ADD CONSTRAINT "understanding_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "understanding_decisions" ADD CONSTRAINT "understanding_decisions_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "understanding_decisions" ADD CONSTRAINT "understanding_decisions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "understanding_decisions" ADD CONSTRAINT "understanding_decisions_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "understanding_decisions" ADD CONSTRAINT "understanding_decisions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "scenario_set_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "understanding_decisions" ADD CONSTRAINT "understanding_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_revisions" ADD CONSTRAINT "story_revisions_understanding_decision_id_fkey" FOREIGN KEY ("understanding_decision_id") REFERENCES "understanding_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_scenarios" ADD CONSTRAINT "story_scenarios_source_draft_id_fkey" FOREIGN KEY ("source_draft_id") REFERENCES "scenario_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_scenarios" ADD CONSTRAINT "story_scenarios_understanding_decision_id_fkey" FOREIGN KEY ("understanding_decision_id") REFERENCES "understanding_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
