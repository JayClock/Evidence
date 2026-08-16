-- Preserve every immutable execution Manifest when a human routes an approval back to Pair.
DROP INDEX "pair_execution_manifests_pair_run_id_key";

CREATE INDEX "pair_execution_manifests_pair_run_id_generated_at_idx"
ON "pair_execution_manifests"("pair_run_id", "generated_at");
