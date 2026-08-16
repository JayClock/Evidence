-- EVD-004 is a breaking cutover. Direct Story-to-CodingRun authority and all
-- existing run records are intentionally removed without backfill or dual-read.
DROP TABLE "coding_runs";
