CREATE TABLE "pair_runs" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "story_revision_sha256" TEXT NOT NULL,
  "approved_tasking_plan_id" TEXT NOT NULL,
  "approved_tasking_plan_sha256" TEXT NOT NULL,
  "base_commit_sha" TEXT NOT NULL,
  "branch_name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "checkpoint" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "cursor" JSONB NOT NULL,
  "completed_test_ids" JSONB NOT NULL,
  "completed_step_keys" JSONB NOT NULL,
  "execution_budget" JSONB NOT NULL,
  "budget_usage" JSONB NOT NULL,
  "lease_owner_id" TEXT,
  "lease_token_sha256" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "current_diff_sha256" TEXT,
  "final_manifest_sha256" TEXT,
  "approved_commit_sha" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "pair_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pair_driver_attempts" (
  "id" TEXT NOT NULL,
  "pair_run_id" TEXT NOT NULL,
  "action_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "task_id" TEXT,
  "test_id" TEXT,
  "process_id" TEXT,
  "step_id" TEXT,
  "summary" TEXT NOT NULL,
  "changed_paths" JSONB NOT NULL,
  "before_worktree_sha256" TEXT NOT NULL,
  "after_worktree_sha256" TEXT NOT NULL,
  "diff_sha256" TEXT NOT NULL,
  "agent_call_count" INTEGER NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "completed_at" TIMESTAMP(3) NOT NULL,
  "record_sha256" TEXT NOT NULL,
  CONSTRAINT "pair_driver_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pair_command_observations" (
  "id" TEXT NOT NULL,
  "pair_run_id" TEXT NOT NULL,
  "action_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "stage" TEXT NOT NULL,
  "task_id" TEXT,
  "test_id" TEXT,
  "process_id" TEXT NOT NULL,
  "step_id" TEXT,
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
  "worktree_sha256" TEXT NOT NULL,
  "diff_sha256" TEXT NOT NULL,
  "failure_fingerprint" TEXT,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "previous_record_sha256" TEXT,
  "record_sha256" TEXT NOT NULL,
  CONSTRAINT "pair_command_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pair_red_reviews" (
  "id" TEXT NOT NULL,
  "pair_run_id" TEXT NOT NULL,
  "action_id" TEXT NOT NULL,
  "observation_id" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "accepted" BOOLEAN NOT NULL,
  "reason" TEXT NOT NULL,
  "reviewed_at" TIMESTAMP(3) NOT NULL,
  "record_sha256" TEXT NOT NULL,
  CONSTRAINT "pair_red_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pair_automation_exceptions" (
  "id" TEXT NOT NULL,
  "pair_run_id" TEXT NOT NULL,
  "action_id" TEXT,
  "kind" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "failure_fingerprint" TEXT,
  "allowed_routes" JSONB NOT NULL,
  "raised_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "record_sha256" TEXT NOT NULL,
  CONSTRAINT "pair_automation_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pair_execution_manifests" (
  "id" TEXT NOT NULL,
  "pair_run_id" TEXT NOT NULL,
  "approved_tasking_plan_sha256" TEXT NOT NULL,
  "story_revision_sha256" TEXT NOT NULL,
  "base_commit_sha" TEXT NOT NULL,
  "completed_test_ids" JSONB NOT NULL,
  "completed_step_keys" JSONB NOT NULL,
  "driver_attempt_ids" JSONB NOT NULL,
  "command_observation_ids" JSONB NOT NULL,
  "red_review_ids" JSONB NOT NULL,
  "changed_paths" JSONB NOT NULL,
  "final_diff_sha256" TEXT NOT NULL,
  "evidence_chain_sha256" TEXT NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "content_sha256" TEXT NOT NULL,
  CONSTRAINT "pair_execution_manifests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pair_coding_decisions" (
  "id" TEXT NOT NULL,
  "pair_run_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "manifest_sha256" TEXT,
  "diff_sha256" TEXT,
  "commit_sha" TEXT,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL,
  "content_sha256" TEXT NOT NULL,
  CONSTRAINT "pair_coding_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pair_runs_approved_tasking_plan_id_key" ON "pair_runs"("approved_tasking_plan_id");
CREATE UNIQUE INDEX "pair_runs_iteration_id_reference_key" ON "pair_runs"("iteration_id", "reference");
CREATE INDEX "pair_runs_workspace_id_status_updated_at_idx" ON "pair_runs"("workspace_id", "status", "updated_at");
CREATE INDEX "pair_runs_iteration_id_started_at_idx" ON "pair_runs"("iteration_id", "started_at");
CREATE UNIQUE INDEX "pair_runs_one_open_per_iteration" ON "pair_runs"("iteration_id") WHERE "status" IN ('running', 'approval_required', 'exception');
CREATE UNIQUE INDEX "pair_runs_one_open_per_workspace" ON "pair_runs"("workspace_id") WHERE "status" IN ('running', 'approval_required', 'exception');
CREATE UNIQUE INDEX "pair_driver_attempts_pair_run_id_action_id_key" ON "pair_driver_attempts"("pair_run_id", "action_id");
CREATE UNIQUE INDEX "pair_driver_attempts_pair_run_id_sequence_key" ON "pair_driver_attempts"("pair_run_id", "sequence");
CREATE UNIQUE INDEX "pair_command_observations_pair_run_id_action_id_key" ON "pair_command_observations"("pair_run_id", "action_id");
CREATE UNIQUE INDEX "pair_command_observations_pair_run_id_sequence_key" ON "pair_command_observations"("pair_run_id", "sequence");
CREATE UNIQUE INDEX "pair_red_reviews_observation_id_key" ON "pair_red_reviews"("observation_id");
CREATE UNIQUE INDEX "pair_red_reviews_pair_run_id_action_id_key" ON "pair_red_reviews"("pair_run_id", "action_id");
CREATE INDEX "pair_red_reviews_pair_run_id_reviewed_at_idx" ON "pair_red_reviews"("pair_run_id", "reviewed_at");
CREATE INDEX "pair_automation_exceptions_pair_run_id_resolved_at_raised_at_idx" ON "pair_automation_exceptions"("pair_run_id", "resolved_at", "raised_at");
CREATE UNIQUE INDEX "pair_execution_manifests_pair_run_id_key" ON "pair_execution_manifests"("pair_run_id");
CREATE UNIQUE INDEX "pair_coding_decisions_pair_run_id_sequence_key" ON "pair_coding_decisions"("pair_run_id", "sequence");
CREATE INDEX "pair_coding_decisions_pair_run_id_decided_at_idx" ON "pair_coding_decisions"("pair_run_id", "decided_at");

ALTER TABLE "pair_runs" ADD CONSTRAINT "pair_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_runs" ADD CONSTRAINT "pair_runs_iteration_id_fkey" FOREIGN KEY ("iteration_id") REFERENCES "iterations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_runs" ADD CONSTRAINT "pair_runs_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_runs" ADD CONSTRAINT "pair_runs_story_revision_id_fkey" FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pair_runs" ADD CONSTRAINT "pair_runs_approved_tasking_plan_id_fkey" FOREIGN KEY ("approved_tasking_plan_id") REFERENCES "approved_tasking_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pair_driver_attempts" ADD CONSTRAINT "pair_driver_attempts_pair_run_id_fkey" FOREIGN KEY ("pair_run_id") REFERENCES "pair_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_command_observations" ADD CONSTRAINT "pair_command_observations_pair_run_id_fkey" FOREIGN KEY ("pair_run_id") REFERENCES "pair_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_red_reviews" ADD CONSTRAINT "pair_red_reviews_pair_run_id_fkey" FOREIGN KEY ("pair_run_id") REFERENCES "pair_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_red_reviews" ADD CONSTRAINT "pair_red_reviews_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "pair_command_observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pair_automation_exceptions" ADD CONSTRAINT "pair_automation_exceptions_pair_run_id_fkey" FOREIGN KEY ("pair_run_id") REFERENCES "pair_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_execution_manifests" ADD CONSTRAINT "pair_execution_manifests_pair_run_id_fkey" FOREIGN KEY ("pair_run_id") REFERENCES "pair_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_coding_decisions" ADD CONSTRAINT "pair_coding_decisions_pair_run_id_fkey" FOREIGN KEY ("pair_run_id") REFERENCES "pair_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pair_coding_decisions" ADD CONSTRAINT "pair_coding_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
