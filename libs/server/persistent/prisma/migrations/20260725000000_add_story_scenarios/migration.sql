ALTER TABLE "stories"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "story_scenarios" (
  "id" TEXT NOT NULL,
  "story_revision_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "given_steps" JSONB NOT NULL,
  "when_step" TEXT NOT NULL,
  "then_steps" JSONB NOT NULL,

  CONSTRAINT "story_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "story_scenarios_story_revision_id_position_key"
  ON "story_scenarios"("story_revision_id", "position");

ALTER TABLE "story_scenarios"
  ADD CONSTRAINT "story_scenarios_story_revision_id_fkey"
  FOREIGN KEY ("story_revision_id") REFERENCES "story_revisions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
