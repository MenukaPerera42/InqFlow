BEGIN;

CREATE TABLE "TeamManager" (
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamManager_pkey" PRIMARY KEY ("teamId", "userId")
);
CREATE INDEX "TeamManager_userId_idx" ON "TeamManager"("userId");
ALTER TABLE "TeamManager" ADD CONSTRAINT "TeamManager_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamManager" ADD CONSTRAINT "TeamManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Category" ADD COLUMN "defaultTeamId" UUID;
CREATE INDEX "Category_defaultTeamId_idx" ON "Category"("defaultTeamId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_defaultTeamId_fkey" FOREIGN KEY ("defaultTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ManagementAudit" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagementAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ManagementAudit_targetType_targetId_createdAt_id_idx" ON "ManagementAudit"("targetType", "targetId", "createdAt", "id");
CREATE INDEX "ManagementAudit_actorId_createdAt_idx" ON "ManagementAudit"("actorId", "createdAt");
ALTER TABLE "ManagementAudit" ADD CONSTRAINT "ManagementAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing names are unique exactly; these indexes also reject casing-only duplicates.
CREATE UNIQUE INDEX "Team_name_normalized_key" ON "Team"(lower("name"));
CREATE UNIQUE INDEX "Category_name_normalized_key" ON "Category"(lower("name"));

COMMIT;
