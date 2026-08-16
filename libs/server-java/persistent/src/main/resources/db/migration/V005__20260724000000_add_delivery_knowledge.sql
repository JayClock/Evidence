CREATE TABLE "story_candidates" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "problem" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "cognitive_mode" TEXT NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "proposed_by_user_id" TEXT NOT NULL,
  "proposed_at" TIMESTAMP(3) NOT NULL,
  "decided_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),

  CONSTRAINT "story_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_candidate_citations" (
  "id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "inbox_revision_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "locator" TEXT NOT NULL,

  CONSTRAINT "story_candidate_citations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stories" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "latest_revision_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_revisions" (
  "id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "problem" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "cognitive_mode" TEXT NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "source_candidate_id" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "story_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_revision_citations" (
  "id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "inbox_revision_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "locator" TEXT NOT NULL,

  CONSTRAINT "story_revision_citations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "story_candidates_workspace_id_status_proposed_at_idx"
  ON "story_candidates"("workspace_id", "status", "proposed_at");
CREATE UNIQUE INDEX "story_candidate_citations_candidate_id_position_key"
  ON "story_candidate_citations"("candidate_id", "position");
CREATE UNIQUE INDEX "story_candidate_citation_revision_locator_key"
  ON "story_candidate_citations"("candidate_id", "inbox_revision_id", "locator");
CREATE INDEX "story_candidate_citations_inbox_revision_id_idx"
  ON "story_candidate_citations"("inbox_revision_id");
CREATE UNIQUE INDEX "stories_latest_revision_id_key"
  ON "stories"("latest_revision_id");
CREATE INDEX "stories_workspace_id_updated_at_idx"
  ON "stories"("workspace_id", "updated_at");
CREATE UNIQUE INDEX "story_revisions_source_candidate_id_key"
  ON "story_revisions"("source_candidate_id");
CREATE UNIQUE INDEX "story_revisions_story_id_revision_number_key"
  ON "story_revisions"("story_id", "revision_number");
CREATE INDEX "story_revisions_story_id_created_at_idx"
  ON "story_revisions"("story_id", "created_at");
CREATE UNIQUE INDEX "story_revision_citations_story_revision_id_position_key"
  ON "story_revision_citations"("story_revision_id", "position");
CREATE UNIQUE INDEX "story_revision_citation_revision_locator_key"
  ON "story_revision_citations"("story_revision_id", "inbox_revision_id", "locator");
CREATE INDEX "story_revision_citations_inbox_revision_id_idx"
  ON "story_revision_citations"("inbox_revision_id");

ALTER TABLE "story_candidates"
  ADD CONSTRAINT "story_candidates_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_candidates"
  ADD CONSTRAINT "story_candidates_proposed_by_user_id_fkey"
  FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_candidates"
  ADD CONSTRAINT "story_candidates_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_candidate_citations"
  ADD CONSTRAINT "story_candidate_citations_candidate_id_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "story_candidates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_candidate_citations"
  ADD CONSTRAINT "story_candidate_citations_inbox_revision_id_fkey"
  FOREIGN KEY ("inbox_revision_id") REFERENCES "inbox_revisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stories"
  ADD CONSTRAINT "stories_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_revisions"
  ADD CONSTRAINT "story_revisions_story_id_fkey"
  FOREIGN KEY ("story_id") REFERENCES "stories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_revisions"
  ADD CONSTRAINT "story_revisions_source_candidate_id_fkey"
  FOREIGN KEY ("source_candidate_id") REFERENCES "story_candidates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_revisions"
  ADD CONSTRAINT "story_revisions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_revision_citations"
  ADD CONSTRAINT "story_revision_citations_story_revision_id_fkey"
  FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_revision_citations"
  ADD CONSTRAINT "story_revision_citations_inbox_revision_id_fkey"
  FOREIGN KEY ("inbox_revision_id") REFERENCES "inbox_revisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stories"
  ADD CONSTRAINT "stories_latest_revision_id_fkey"
  FOREIGN KEY ("latest_revision_id") REFERENCES "story_revisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
