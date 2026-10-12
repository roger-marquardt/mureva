-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- DropTable
DROP TABLE "Lead";

-- CreateTable
CREATE TABLE "ModelPrice" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL,
    "inputPerMillionUsd" DECIMAL(12,6) NOT NULL,
    "cachedInputPerMillionUsd" DECIMAL(12,6) NOT NULL,
    "cacheWritePerMillionUsd" DECIMAL(12,6) NOT NULL,
    "outputPerMillionUsd" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lead" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT NOT NULL,
    "ip" TEXT,
    "ipCity" TEXT,
    "ipRegion" TEXT,
    "ipCountry" TEXT,
    "ipNetwork" TEXT,
    "userAgent" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(14,8),
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(14,8),
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelPrice_model_key" ON "ModelPrice"("model");

-- CreateIndex
CREATE INDEX "Conversation_status_createdAt_idx" ON "Conversation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_conversationId_createdAt_idx" ON "LlmCall"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prices are USD per 1M tokens, standard processing tier.
INSERT INTO "ModelPrice" (
    "id", "provider", "model",
    "inputPerMillionUsd", "cachedInputPerMillionUsd", "cacheWritePerMillionUsd", "outputPerMillionUsd",
    "updatedAt"
) VALUES (
    'price_gpt_6_luna', 'openai', 'gpt-6-luna',
    0.10, 0.01, 0.125, 0.50,
    CURRENT_TIMESTAMP
);
