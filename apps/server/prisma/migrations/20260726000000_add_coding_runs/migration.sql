CREATE TABLE "coding_runs" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "base_commit_sha" TEXT NOT NULL,
  "diff_sha256" TEXT,
  "changed_file_count" INTEGER,
  "quality_checks" JSONB NOT NULL DEFAULT '[]',
  "commit_sha" TEXT,
  "failure_code" TEXT,
  "failure_summary" TEXT,
  "decision_reason" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "execution_finished_at" TIMESTAMP(3),
  "decided_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),

  CONSTRAINT "coding_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coding_runs_status_check" CHECK (
    "status" IN (
      'running',
      'review_required',
      'failed',
      'cancelled',
      'accepted',
      'rejected'
    )
  ),
  CONSTRAINT "coding_runs_version_check" CHECK ("version" > 0),
  CONSTRAINT "coding_runs_changed_file_count_check" CHECK (
    "changed_file_count" IS NULL OR "changed_file_count" >= 0
  )
);

CREATE INDEX "coding_runs_workspace_id_status_started_at_idx"
  ON "coding_runs"("workspace_id", "status", "started_at");
CREATE INDEX "coding_runs_story_id_started_at_idx"
  ON "coding_runs"("story_id", "started_at");
CREATE INDEX "coding_runs_story_revision_id_status_idx"
  ON "coding_runs"("story_revision_id", "status");
CREATE UNIQUE INDEX "coding_runs_one_active_revision_key"
  ON "coding_runs"("workspace_id", "story_revision_id")
  WHERE "status" IN ('running', 'review_required');

ALTER TABLE "coding_runs"
  ADD CONSTRAINT "coding_runs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coding_runs"
  ADD CONSTRAINT "coding_runs_story_id_fkey"
  FOREIGN KEY ("story_id") REFERENCES "stories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coding_runs"
  ADD CONSTRAINT "coding_runs_story_revision_id_fkey"
  FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coding_runs"
  ADD CONSTRAINT "coding_runs_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coding_runs"
  ADD CONSTRAINT "coding_runs_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
