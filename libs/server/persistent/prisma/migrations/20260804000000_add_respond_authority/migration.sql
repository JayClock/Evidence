CREATE TABLE "respond_candidates" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "action_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "iteration_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "story_revision_id" TEXT NOT NULL,
    "showcase_run_id" TEXT NOT NULL,
    "showcase_decision_id" TEXT NOT NULL,
    "authority" JSONB NOT NULL,
    "authority_sha256" TEXT NOT NULL,
    "promotions" JSONB NOT NULL,
    "no_promotion_reason" TEXT,
    "observed_outcomes" JSONB NOT NULL,
    "residual_risks" JSONB NOT NULL,
    "next_probe" JSONB NOT NULL,
    "proposed_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "respond_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "respond_decisions" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "candidate_sha256" TEXT NOT NULL,
    "authority_sha256" TEXT NOT NULL,
    "decided_by_user_id" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "respond_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "respond_candidates_iteration_id_sequence_key" ON "respond_candidates"("iteration_id", "sequence");
CREATE UNIQUE INDEX "respond_candidates_iteration_id_action_id_key" ON "respond_candidates"("iteration_id", "action_id");
CREATE UNIQUE INDEX "respond_candidates_workspace_id_reference_key" ON "respond_candidates"("workspace_id", "reference");
CREATE INDEX "respond_candidates_iteration_id_proposed_at_idx" ON "respond_candidates"("iteration_id", "proposed_at");
CREATE UNIQUE INDEX "respond_decisions_candidate_id_key" ON "respond_decisions"("candidate_id");
CREATE INDEX "respond_decisions_decided_by_user_id_decided_at_idx" ON "respond_decisions"("decided_by_user_id", "decided_at");

ALTER TABLE "respond_candidates" ADD CONSTRAINT "respond_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "respond_candidates" ADD CONSTRAINT "respond_candidates_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "respond_candidates" ADD CONSTRAINT "respond_candidates_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "respond_candidates" ADD CONSTRAINT "respond_candidates_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "respond_candidates" ADD CONSTRAINT "respond_candidates_showcase_run_id_fkey" FOREIGN KEY ("showcase_run_id") REFERENCES "showcase_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "respond_candidates" ADD CONSTRAINT "respond_candidates_showcase_decision_id_fkey" FOREIGN KEY ("showcase_decision_id") REFERENCES "showcase_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "respond_decisions" ADD CONSTRAINT "respond_decisions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "respond_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "respond_decisions" ADD CONSTRAINT "respond_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
