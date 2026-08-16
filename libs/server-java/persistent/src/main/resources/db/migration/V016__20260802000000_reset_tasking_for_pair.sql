-- EVD-005 intentionally rejects pre-Pair Tasking payloads. Existing Story,
-- Scenario, and No Model Impact authority remains, while mutable Tasking work
-- returns to drafting for a fresh v2 plan and Desk Check.
DELETE FROM "approved_tasking_plans";
DELETE FROM "desk_check_decisions";
DELETE FROM "tasking_candidates";

UPDATE "iterations"
SET
  "loop" = 'tasking',
  "stage" = 'drafting',
  "version" = "version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "loop" = 'tasking';

DROP INDEX "approved_tasking_plans_iteration_id_key";
CREATE INDEX "approved_tasking_plans_iteration_id_approved_at_idx"
  ON "approved_tasking_plans"("iteration_id", "approved_at");
