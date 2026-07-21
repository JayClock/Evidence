-- CreateTable
CREATE TABLE "inbox_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "external_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latest_revision_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_revisions" (
    "id" TEXT NOT NULL,
    "inbox_item_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "uri" TEXT,
    "provider_metadata" JSONB NOT NULL DEFAULT '{}',
    "source_updated_at" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3) NOT NULL,
    "content_sha256" TEXT NOT NULL,

    CONSTRAINT "inbox_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbox_items_latest_revision_id_key" ON "inbox_items"("latest_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_items_workspace_id_source_kind_external_key_key" ON "inbox_items"("workspace_id", "source_kind", "external_key");

-- CreateIndex
CREATE INDEX "inbox_items_workspace_id_status_updated_at_idx" ON "inbox_items"("workspace_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_revisions_inbox_item_id_revision_number_key" ON "inbox_revisions"("inbox_item_id", "revision_number");

-- CreateIndex
CREATE INDEX "inbox_revisions_inbox_item_id_content_sha256_idx" ON "inbox_revisions"("inbox_item_id", "content_sha256");

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_revisions" ADD CONSTRAINT "inbox_revisions_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_latest_revision_id_fkey" FOREIGN KEY ("latest_revision_id") REFERENCES "inbox_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
