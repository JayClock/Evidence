-- CreateTable
CREATE TABLE "showcase_runs" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "iteration_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "story_revision_id" TEXT NOT NULL,
    "story_revision_sha256" TEXT NOT NULL,
    "approved_tasking_plan_id" TEXT NOT NULL,
    "approved_tasking_plan_sha256" TEXT NOT NULL,
    "pair_run_id" TEXT NOT NULL,
    "pair_manifest_id" TEXT NOT NULL,
    "pair_manifest_sha256" TEXT NOT NULL,
    "approved_commit_sha" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "evidence_bundle_sha256" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "showcase_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_q2_observations" (
    "id" TEXT NOT NULL,
    "showcase_run_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "test_id" TEXT NOT NULL,
    "scenario_ids" JSONB NOT NULL,
    "process_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "project_id" TEXT,
    "command" TEXT NOT NULL,
    "termination" TEXT NOT NULL,
    "exit_code" INTEGER,
    "signal" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "stdout_sha256" TEXT NOT NULL,
    "stdout_bytes" INTEGER NOT NULL,
    "stdout_lines" INTEGER NOT NULL,
    "stderr_sha256" TEXT NOT NULL,
    "stderr_bytes" INTEGER NOT NULL,
    "stderr_lines" INTEGER NOT NULL,
    "approved_commit_sha" TEXT NOT NULL,
    "worktree_sha256" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "previous_record_sha256" TEXT,
    "record_sha256" TEXT NOT NULL,

    CONSTRAINT "showcase_q2_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_product_observations" (
    "id" TEXT NOT NULL,
    "showcase_run_id" TEXT NOT NULL,
    "scenario_id" TEXT NOT NULL,
    "scenario_reference" TEXT NOT NULL,
    "given_steps" JSONB NOT NULL,
    "when_step" TEXT NOT NULL,
    "expected_then_steps" JSONB NOT NULL,
    "business_data" JSONB NOT NULL,
    "observed_outcomes" JSONB NOT NULL,
    "observation" TEXT NOT NULL,
    "value_feedback" TEXT NOT NULL,
    "evidence_refs" JSONB NOT NULL,
    "observed_by_user_id" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "showcase_product_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_risk_decisions" (
    "id" TEXT NOT NULL,
    "showcase_run_id" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "activities" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_by_user_id" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "showcase_risk_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_evaluations" (
    "id" TEXT NOT NULL,
    "showcase_run_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "quadrant" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "evidence_refs" JSONB NOT NULL,
    "observed_by_user_id" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "showcase_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_reviews" (
    "id" TEXT NOT NULL,
    "showcase_run_id" TEXT NOT NULL,
    "evidence_bundle_sha256" TEXT NOT NULL,
    "observed_facts" JSONB NOT NULL,
    "product_domain_feedback" JSONB NOT NULL,
    "technical_quality_feedback" JSONB NOT NULL,
    "unresolved_assumptions" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "showcase_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_decisions" (
    "id" TEXT NOT NULL,
    "showcase_run_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "feedback_target" TEXT,
    "evidence_bundle_sha256" TEXT,
    "review_id" TEXT,
    "decided_by_user_id" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "showcase_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "showcase_runs_workspace_id_stage_updated_at_idx" ON "showcase_runs"("workspace_id", "stage", "updated_at");

-- CreateIndex
CREATE INDEX "showcase_runs_pair_run_id_started_at_idx" ON "showcase_runs"("pair_run_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_runs_iteration_id_attempt_key" ON "showcase_runs"("iteration_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_runs_workspace_id_reference_key" ON "showcase_runs"("workspace_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_q2_observations_showcase_run_id_action_id_key" ON "showcase_q2_observations"("showcase_run_id", "action_id");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_q2_observations_showcase_run_id_sequence_key" ON "showcase_q2_observations"("showcase_run_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_q2_observations_showcase_run_id_test_id_key" ON "showcase_q2_observations"("showcase_run_id", "test_id");

-- CreateIndex
CREATE INDEX "showcase_product_observations_scenario_id_idx" ON "showcase_product_observations"("scenario_id");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_product_observations_showcase_run_id_scenario_id_key" ON "showcase_product_observations"("showcase_run_id", "scenario_id");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_risk_decisions_showcase_run_id_quadrant_key" ON "showcase_risk_decisions"("showcase_run_id", "quadrant");

-- CreateIndex
CREATE INDEX "showcase_evaluations_showcase_run_id_quadrant_activity_obse_idx" ON "showcase_evaluations"("showcase_run_id", "quadrant", "activity", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_evaluations_showcase_run_id_sequence_key" ON "showcase_evaluations"("showcase_run_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_reviews_showcase_run_id_key" ON "showcase_reviews"("showcase_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_decisions_showcase_run_id_key" ON "showcase_decisions"("showcase_run_id");

-- CreateIndex
CREATE INDEX "showcase_decisions_decided_by_user_id_decided_at_idx" ON "showcase_decisions"("decided_by_user_id", "decided_at");

-- AddForeignKey
ALTER TABLE "showcase_runs" ADD CONSTRAINT "showcase_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_runs" ADD CONSTRAINT "showcase_runs_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_runs" ADD CONSTRAINT "showcase_runs_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_runs" ADD CONSTRAINT "showcase_runs_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_runs" ADD CONSTRAINT "showcase_runs_approved_tasking_plan_id_fkey" FOREIGN KEY ("approved_tasking_plan_id") REFERENCES "approved_tasking_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_runs" ADD CONSTRAINT "showcase_runs_pair_run_id_fkey" FOREIGN KEY ("pair_run_id") REFERENCES "pair_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_runs" ADD CONSTRAINT "showcase_runs_pair_manifest_id_fkey" FOREIGN KEY ("pair_manifest_id") REFERENCES "pair_execution_manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_q2_observations" ADD CONSTRAINT "showcase_q2_observations_showcase_run_id_fkey" FOREIGN KEY ("showcase_run_id") REFERENCES "showcase_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_product_observations" ADD CONSTRAINT "showcase_product_observations_showcase_run_id_fkey" FOREIGN KEY ("showcase_run_id") REFERENCES "showcase_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_product_observations" ADD CONSTRAINT "showcase_product_observations_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "story_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_product_observations" ADD CONSTRAINT "showcase_product_observations_observed_by_user_id_fkey" FOREIGN KEY ("observed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_risk_decisions" ADD CONSTRAINT "showcase_risk_decisions_showcase_run_id_fkey" FOREIGN KEY ("showcase_run_id") REFERENCES "showcase_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_risk_decisions" ADD CONSTRAINT "showcase_risk_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_evaluations" ADD CONSTRAINT "showcase_evaluations_showcase_run_id_fkey" FOREIGN KEY ("showcase_run_id") REFERENCES "showcase_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_evaluations" ADD CONSTRAINT "showcase_evaluations_observed_by_user_id_fkey" FOREIGN KEY ("observed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_reviews" ADD CONSTRAINT "showcase_reviews_showcase_run_id_fkey" FOREIGN KEY ("showcase_run_id") REFERENCES "showcase_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_decisions" ADD CONSTRAINT "showcase_decisions_showcase_run_id_fkey" FOREIGN KEY ("showcase_run_id") REFERENCES "showcase_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_decisions" ADD CONSTRAINT "showcase_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

