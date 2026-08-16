-- The Inbox Story Candidate and Kickoff workflow is now the sole admission
-- authority. This destructive migration intentionally drops the retired direct
-- Candidate workflow and does not preserve legacy data.
ALTER TABLE "story_revisions"
  DROP CONSTRAINT "story_revisions_source_candidate_id_fkey";

DROP INDEX "story_revisions_source_candidate_id_key";

ALTER TABLE "story_revisions"
  DROP COLUMN "source_candidate_id";

DROP TABLE "story_candidate_citations";
DROP TABLE "story_candidates";
