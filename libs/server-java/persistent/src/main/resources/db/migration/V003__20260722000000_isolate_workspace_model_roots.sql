-- Keep Server-owned model storage private instead of exposing it as Workspace metadata.
ALTER TABLE "workspaces" ADD COLUMN "model_root" TEXT;

UPDATE "workspaces"
SET "model_root" = COALESCE(
  NULLIF("metadata"->>'evidenceRoot', ''),
  CASE
    WHEN NULLIF("metadata"->>'repositoryRoot', '') IS NOT NULL
      THEN ("metadata"->>'repositoryRoot') || '/.evidence'
    ELSE NULL
  END,
  '.evidence'
);

ALTER TABLE "workspaces" ALTER COLUMN "model_root" SET NOT NULL;

UPDATE "workspaces"
SET "metadata" = "metadata"
  - 'repositoryRoot'
  - 'evidenceRoot'
  - 'path'
  - 'rootPath';
