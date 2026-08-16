-- The preceding authority reset guarantees that every subsequently created
-- Story is owned by one Iteration and receives the Iteration-local US-001
-- reference during human Kickoff confirmation.
ALTER TABLE "stories"
  ALTER COLUMN "reference" SET NOT NULL;
