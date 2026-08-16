-- AlterTable
ALTER TABLE "stories" ADD COLUMN     "iteration_id" TEXT,
ADD COLUMN     "reference" TEXT;

-- CreateTable
CREATE TABLE "workspace_sequences" (
    "workspace_id" TEXT NOT NULL,
    "next_extraction_number" INTEGER NOT NULL DEFAULT 1,
    "next_candidate_number" INTEGER NOT NULL DEFAULT 1,
    "next_decision_number" INTEGER NOT NULL DEFAULT 1,
    "next_iteration_number" INTEGER NOT NULL DEFAULT 1,
    "next_kickoff_number" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_sequences_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "inbox_extractions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requested_by_user_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "failure_summary" TEXT,

    CONSTRAINT "inbox_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_extraction_sources" (
    "id" TEXT NOT NULL,
    "extraction_id" TEXT NOT NULL,
    "inbox_item_id" TEXT NOT NULL,
    "inbox_revision_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "source_kind" TEXT NOT NULL,
    "external_key" TEXT NOT NULL,
    "item_status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "uri" TEXT,
    "provider_metadata" JSONB NOT NULL DEFAULT '{}',
    "source_updated_at" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "inbox_extraction_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_story_candidates" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "extraction_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "cognitive_mode" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "proposed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_story_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_story_citations" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "inbox_item_id" TEXT NOT NULL,
    "inbox_revision_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "locator" TEXT NOT NULL,
    "revision_sha256" TEXT NOT NULL,

    CONSTRAINT "inbox_story_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_candidate_decisions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "candidate_sha256" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_by_user_id" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "inbox_candidate_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iterations" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_candidate_id" TEXT NOT NULL,
    "source_candidate_sha256" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "loop" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "base_commit_sha" TEXT NOT NULL,
    "branch_name" TEXT,
    "admitted_by_user_id" TEXT NOT NULL,
    "admitted_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iterations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iteration_intakes" (
    "iteration_id" TEXT NOT NULL,
    "candidate_snapshot" JSONB NOT NULL,
    "source_snapshots" JSONB NOT NULL,
    "requirements_projection" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "frozen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iteration_intakes_pkey" PRIMARY KEY ("iteration_id")
);

-- CreateTable
CREATE TABLE "kickoff_proposals" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "iteration_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "cognitive_mode" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "proposed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kickoff_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kickoff_decisions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "iteration_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "proposal_sha256" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "decided_by_user_id" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "kickoff_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "extraction_id" TEXT,
    "iteration_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "capability_sha256" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "output_sha256" TEXT,
    "failure_summary" TEXT,

    CONSTRAINT "activity_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_statement_revisions" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "iteration_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "cognitive_mode" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_statement_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_card_revisions" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "iteration_id" TEXT NOT NULL,
    "problem_statement_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_card_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_extractions_workspace_id_status_requested_at_idx" ON "inbox_extractions"("workspace_id", "status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_extractions_workspace_id_reference_key" ON "inbox_extractions"("workspace_id", "reference");

-- CreateIndex
CREATE INDEX "inbox_extraction_sources_inbox_revision_id_idx" ON "inbox_extraction_sources"("inbox_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_extraction_sources_extraction_id_position_key" ON "inbox_extraction_sources"("extraction_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_extraction_sources_extraction_id_inbox_item_id_key" ON "inbox_extraction_sources"("extraction_id", "inbox_item_id");

-- CreateIndex
CREATE INDEX "inbox_story_candidates_workspace_id_proposed_at_idx" ON "inbox_story_candidates"("workspace_id", "proposed_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_story_candidates_workspace_id_reference_key" ON "inbox_story_candidates"("workspace_id", "reference");

-- CreateIndex
CREATE INDEX "inbox_story_citations_inbox_revision_id_idx" ON "inbox_story_citations"("inbox_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_story_citations_candidate_id_position_key" ON "inbox_story_citations"("candidate_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_story_citation_revision_locator_key" ON "inbox_story_citations"("candidate_id", "inbox_revision_id", "locator");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_candidate_decisions_candidate_id_key" ON "inbox_candidate_decisions"("candidate_id");

-- CreateIndex
CREATE INDEX "inbox_candidate_decisions_workspace_id_decided_at_idx" ON "inbox_candidate_decisions"("workspace_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_candidate_decisions_workspace_id_reference_key" ON "inbox_candidate_decisions"("workspace_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "iterations_source_candidate_id_key" ON "iterations"("source_candidate_id");

-- CreateIndex
CREATE INDEX "iterations_workspace_id_lifecycle_lane_admitted_at_idx" ON "iterations"("workspace_id", "lifecycle", "lane", "admitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "iterations_workspace_id_reference_key" ON "iterations"("workspace_id", "reference");

-- CreateIndex
CREATE INDEX "kickoff_proposals_iteration_id_proposed_at_idx" ON "kickoff_proposals"("iteration_id", "proposed_at");

-- CreateIndex
CREATE UNIQUE INDEX "kickoff_proposals_iteration_id_sequence_key" ON "kickoff_proposals"("iteration_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "kickoff_proposals_iteration_id_reference_key" ON "kickoff_proposals"("iteration_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "kickoff_decisions_proposal_id_key" ON "kickoff_decisions"("proposal_id");

-- CreateIndex
CREATE INDEX "kickoff_decisions_iteration_id_decided_at_idx" ON "kickoff_decisions"("iteration_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "kickoff_decisions_iteration_id_reference_key" ON "kickoff_decisions"("iteration_id", "reference");

-- CreateIndex
CREATE INDEX "activity_runs_workspace_id_status_expires_at_idx" ON "activity_runs"("workspace_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "activity_runs_extraction_id_idx" ON "activity_runs"("extraction_id");

-- CreateIndex
CREATE INDEX "activity_runs_iteration_id_idx" ON "activity_runs"("iteration_id");

-- CreateIndex
CREATE INDEX "problem_statement_revisions_iteration_id_idx" ON "problem_statement_revisions"("iteration_id");

-- CreateIndex
CREATE UNIQUE INDEX "problem_statement_revisions_story_id_revision_number_key" ON "problem_statement_revisions"("story_id", "revision_number");

-- CreateIndex
CREATE INDEX "story_card_revisions_iteration_id_idx" ON "story_card_revisions"("iteration_id");

-- CreateIndex
CREATE INDEX "story_card_revisions_problem_statement_id_idx" ON "story_card_revisions"("problem_statement_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_card_revisions_story_id_revision_number_key" ON "story_card_revisions"("story_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "stories_iteration_id_key" ON "stories"("iteration_id");

-- AddForeignKey
ALTER TABLE "workspace_sequences" ADD CONSTRAINT "workspace_sequences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_extractions" ADD CONSTRAINT "inbox_extractions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_extractions" ADD CONSTRAINT "inbox_extractions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_extraction_sources" ADD CONSTRAINT "inbox_extraction_sources_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "inbox_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_extraction_sources" ADD CONSTRAINT "inbox_extraction_sources_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_extraction_sources" ADD CONSTRAINT "inbox_extraction_sources_inbox_revision_id_fkey" FOREIGN KEY ("inbox_revision_id") REFERENCES "inbox_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_story_candidates" ADD CONSTRAINT "inbox_story_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_story_candidates" ADD CONSTRAINT "inbox_story_candidates_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "inbox_extractions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_story_citations" ADD CONSTRAINT "inbox_story_citations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "inbox_story_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_story_citations" ADD CONSTRAINT "inbox_story_citations_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_story_citations" ADD CONSTRAINT "inbox_story_citations_inbox_revision_id_fkey" FOREIGN KEY ("inbox_revision_id") REFERENCES "inbox_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_candidate_decisions" ADD CONSTRAINT "inbox_candidate_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_candidate_decisions" ADD CONSTRAINT "inbox_candidate_decisions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "inbox_story_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_candidate_decisions" ADD CONSTRAINT "inbox_candidate_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iterations" ADD CONSTRAINT "iterations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iterations" ADD CONSTRAINT "iterations_source_candidate_id_fkey" FOREIGN KEY ("source_candidate_id") REFERENCES "inbox_story_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iterations" ADD CONSTRAINT "iterations_admitted_by_user_id_fkey" FOREIGN KEY ("admitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iteration_intakes" ADD CONSTRAINT "iteration_intakes_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickoff_proposals" ADD CONSTRAINT "kickoff_proposals_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickoff_decisions" ADD CONSTRAINT "kickoff_decisions_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickoff_decisions" ADD CONSTRAINT "kickoff_decisions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "kickoff_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kickoff_decisions" ADD CONSTRAINT "kickoff_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_runs" ADD CONSTRAINT "activity_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_runs" ADD CONSTRAINT "activity_runs_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "inbox_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_runs" ADD CONSTRAINT "activity_runs_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_statement_revisions" ADD CONSTRAINT "problem_statement_revisions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_card_revisions" ADD CONSTRAINT "story_card_revisions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
