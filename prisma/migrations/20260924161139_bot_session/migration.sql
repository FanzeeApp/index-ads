-- CreateTable
CREATE TABLE "BotSession" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "BotSession_updatedAt_idx" ON "BotSession"("updatedAt");
