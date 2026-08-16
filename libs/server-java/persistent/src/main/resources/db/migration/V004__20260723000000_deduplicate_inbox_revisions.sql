-- Point latest references at the first copy before removing historical duplicates.
WITH duplicate_map AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "inbox_item_id", "content_sha256"
      ORDER BY "revision_number", "captured_at", "id"
    ) AS "keeper_id"
  FROM "inbox_revisions"
)
UPDATE "inbox_items" AS item
SET "latest_revision_id" = duplicate_map."keeper_id"
FROM duplicate_map
WHERE item."latest_revision_id" = duplicate_map."id"
  AND duplicate_map."id" <> duplicate_map."keeper_id";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "inbox_item_id", "content_sha256"
      ORDER BY "revision_number", "captured_at", "id"
    ) AS "duplicate_number"
  FROM "inbox_revisions"
)
DELETE FROM "inbox_revisions" AS revision
USING ranked
WHERE revision."id" = ranked."id"
  AND ranked."duplicate_number" > 1;

-- Keep revision numbers contiguous so the next distinct snapshot can use count + 1.
UPDATE "inbox_revisions"
SET "revision_number" = -"revision_number";

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "inbox_item_id"
      ORDER BY "revision_number" DESC, "captured_at", "id"
    ) AS "next_revision_number"
  FROM "inbox_revisions"
)
UPDATE "inbox_revisions" AS revision
SET "revision_number" = numbered."next_revision_number"
FROM numbered
WHERE revision."id" = numbered."id";

DROP INDEX "inbox_revisions_inbox_item_id_content_sha256_idx";
CREATE UNIQUE INDEX "inbox_revisions_inbox_item_id_content_sha256_key"
  ON "inbox_revisions"("inbox_item_id", "content_sha256");
