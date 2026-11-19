BEGIN;
-- CreateEnum
CREATE TYPE "AccountAction" AS ENUM ('APPROVED', 'REJECTED', 'SUSPENDED', 'REACTIVATED');

-- CreateTable
CREATE TABLE "AccountAudit" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "action" "AccountAction" NOT NULL,
    "previousStatus" "AccountStatus" NOT NULL,
    "nextStatus" "AccountStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountAudit_targetId_createdAt_id_idx" ON "AccountAudit"("targetId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AccountAudit_actorId_createdAt_idx" ON "AccountAudit"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountAudit" ADD CONSTRAINT "AccountAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAudit" ADD CONSTRAINT "AccountAudit_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
