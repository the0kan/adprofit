-- AlterTable: Meta connection fields + one row per workspace+provider
ALTER TABLE "Connection" ADD COLUMN     "tokenType" TEXT;
ALTER TABLE "Connection" ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Connection" ADD COLUMN     "currency" TEXT;
ALTER TABLE "Connection" ADD COLUMN     "timezoneName" TEXT;
ALTER TABLE "Connection" ADD COLUMN     "connectedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Connection_workspaceId_provider_key" ON "Connection"("workspaceId", "provider");

-- CreateTable
CREATE TABLE "MetaSyncLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metaConnectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CAMPAIGN_INSIGHTS',
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaSyncLog_workspaceId_idx" ON "MetaSyncLog"("workspaceId");
CREATE INDEX "MetaSyncLog_metaConnectionId_idx" ON "MetaSyncLog"("metaConnectionId");

ALTER TABLE "MetaSyncLog" ADD CONSTRAINT "MetaSyncLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaSyncLog" ADD CONSTRAINT "MetaSyncLog_metaConnectionId_fkey" FOREIGN KEY ("metaConnectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
