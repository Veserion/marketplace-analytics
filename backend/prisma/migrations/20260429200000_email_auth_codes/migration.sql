ALTER TYPE "AuditAction" ADD VALUE 'email_code_requested';
ALTER TYPE "AuditAction" ADD VALUE 'email_code_verified';

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "EmailAuthCode" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAuthCode_email_idx" ON "EmailAuthCode"("email");
CREATE INDEX "EmailAuthCode_expiresAt_idx" ON "EmailAuthCode"("expiresAt");
