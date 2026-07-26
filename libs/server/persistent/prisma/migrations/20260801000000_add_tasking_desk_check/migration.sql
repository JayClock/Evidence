CREATE TABLE "no_model_impact_decisions" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "story_revision_sha256" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL,
  "content_sha256" TEXT NOT NULL,
  CONSTRAINT "no_model_impact_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tasking_candidates" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "story_revision_sha256" TEXT NOT NULL,
  "base_commit_sha" TEXT NOT NULL,
  "no_model_impact_decision_id" TEXT NOT NULL,
  "no_model_impact_decision_sha256" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "project_catalog_sha256" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "proposed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tasking_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "desk_check_decisions" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "candidate_sha256" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL,
  "content_sha256" TEXT NOT NULL,
  CONSTRAINT "desk_check_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approved_tasking_plans" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "tasking_candidate_id" TEXT NOT NULL,
  "desk_check_decision_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "approved_by_user_id" TEXT NOT NULL,
  "approved_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approved_tasking_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "no_model_impact_decisions_story_revision_id_key" ON "no_model_impact_decisions"("story_revision_id");
CREATE UNIQUE INDEX "no_model_impact_decisions_iteration_id_reference_key" ON "no_model_impact_decisions"("iteration_id", "reference");
CREATE INDEX "no_model_impact_decisions_workspace_id_iteration_id_decided_at_idx" ON "no_model_impact_decisions"("workspace_id", "iteration_id", "decided_at");
CREATE UNIQUE INDEX "tasking_candidates_iteration_id_reference_key" ON "tasking_candidates"("iteration_id", "reference");
CREATE UNIQUE INDEX "tasking_candidates_iteration_id_sequence_key" ON "tasking_candidates"("iteration_id", "sequence");
CREATE INDEX "tasking_candidates_workspace_id_iteration_id_proposed_at_idx" ON "tasking_candidates"("workspace_id", "iteration_id", "proposed_at");
CREATE UNIQUE INDEX "desk_check_decisions_candidate_id_key" ON "desk_check_decisions"("candidate_id");
CREATE UNIQUE INDEX "desk_check_decisions_iteration_id_reference_key" ON "desk_check_decisions"("iteration_id", "reference");
CREATE INDEX "desk_check_decisions_workspace_id_iteration_id_decided_at_idx" ON "desk_check_decisions"("workspace_id", "iteration_id", "decided_at");
CREATE UNIQUE INDEX "approved_tasking_plans_iteration_id_key" ON "approved_tasking_plans"("iteration_id");
CREATE UNIQUE INDEX "approved_tasking_plans_tasking_candidate_id_key" ON "approved_tasking_plans"("tasking_candidate_id");
CREATE UNIQUE INDEX "approved_tasking_plans_desk_check_decision_id_key" ON "approved_tasking_plans"("desk_check_decision_id");
CREATE INDEX "approved_tasking_plans_workspace_id_approved_at_idx" ON "approved_tasking_plans"("workspace_id", "approved_at");

ALTER TABLE "no_model_impact_decisions" ADD CONSTRAINT "no_model_impact_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "no_model_impact_decisions" ADD CONSTRAINT "no_model_impact_decisions_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "no_model_impact_decisions" ADD CONSTRAINT "no_model_impact_decisions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "no_model_impact_decisions" ADD CONSTRAINT "no_model_impact_decisions_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "no_model_impact_decisions" ADD CONSTRAINT "no_model_impact_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasking_candidates" ADD CONSTRAINT "tasking_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasking_candidates" ADD CONSTRAINT "tasking_candidates_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasking_candidates" ADD CONSTRAINT "tasking_candidates_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasking_candidates" ADD CONSTRAINT "tasking_candidates_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasking_candidates" ADD CONSTRAINT "tasking_candidates_no_model_impact_decision_id_fkey" FOREIGN KEY ("no_model_impact_decision_id") REFERENCES "no_model_impact_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "desk_check_decisions" ADD CONSTRAINT "desk_check_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "desk_check_decisions" ADD CONSTRAINT "desk_check_decisions_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "desk_check_decisions" ADD CONSTRAINT "desk_check_decisions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "tasking_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "desk_check_decisions" ADD CONSTRAINT "desk_check_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approved_tasking_plans" ADD CONSTRAINT "approved_tasking_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approved_tasking_plans" ADD CONSTRAINT "approved_tasking_plans_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approved_tasking_plans" ADD CONSTRAINT "approved_tasking_plans_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approved_tasking_plans" ADD CONSTRAINT "approved_tasking_plans_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approved_tasking_plans" ADD CONSTRAINT "approved_tasking_plans_tasking_candidate_id_fkey" FOREIGN KEY ("tasking_candidate_id") REFERENCES "tasking_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approved_tasking_plans" ADD CONSTRAINT "approved_tasking_plans_desk_check_decision_id_fkey" FOREIGN KEY ("desk_check_decision_id") REFERENCES "desk_check_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approved_tasking_plans" ADD CONSTRAINT "approved_tasking_plans_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
