-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "kickUserId" INTEGER,
    "kickUsername" TEXT NOT NULL,
    "kickChannelSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'KICK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KickCredential" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KickCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionState" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastHealthyAt" TIMESTAMP(3),
    "lastError" TEXT,
    "subscriptionsActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSettings" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "commandPrefix" TEXT NOT NULL DEFAULT '!',
    "botDisplayName" TEXT NOT NULL DEFAULT 'البوت',
    "language" TEXT NOT NULL DEFAULT 'ar',
    "sendType" TEXT NOT NULL DEFAULT 'user',
    "minSendIntervalMs" INTEGER NOT NULL DEFAULT 1200,
    "replyToCommands" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "registrationCommand" TEXT NOT NULL DEFAULT '!join',
    "leaveCommand" TEXT NOT NULL DEFAULT '!leave',
    "answerCommand" TEXT NOT NULL DEFAULT '!answer',
    "teamCommand" TEXT NOT NULL DEFAULT '!team',
    "scoreCommand" TEXT NOT NULL DEFAULT '!score',
    "helpCommand" TEXT NOT NULL DEFAULT '!help',
    "eventCommand" TEXT NOT NULL DEFAULT '!event',
    "config" TEXT NOT NULL DEFAULT '{}',
    "simulation" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "scheduledStartAt" TIMESTAMP(3),
    "registrationOpenedAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "currentRoundIndex" INTEGER NOT NULL DEFAULT -1,
    "currentRoundEndsAt" TIMESTAMP(3),
    "currentRoundRemainingMs" INTEGER,
    "winnerParticipantId" TEXT,
    "winnerTeamName" TEXT,
    "resultOutcome" TEXT,
    "resultComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT,
    "correctAnswers" TEXT NOT NULL,
    "timeLimitSec" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "speedBonus" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kickUserId" INTEGER NOT NULL,
    "kickUsername" TEXT NOT NULL,
    "teamName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "participantId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "rejectedReason" TEXT,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "speedBonus" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreAward" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "participantId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'CORRECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventResult" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "winnerParticipantId" TEXT,
    "winnerTeamName" TEXT,
    "standings" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookIngest" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookIngest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT,
    "userId" TEXT,
    "eventId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_kickUserId_key" ON "Channel"("kickUserId");

-- CreateIndex
CREATE INDEX "Channel_ownerUserId_idx" ON "Channel"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "KickCredential_channelId_key" ON "KickCredential"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionState_channelId_key" ON "ConnectionState"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "BotSettings_channelId_key" ON "BotSettings"("channelId");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "Event_channelId_status_idx" ON "Event"("channelId", "status");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Question_eventId_index_key" ON "Question"("eventId", "index");

-- CreateIndex
CREATE INDEX "Participant_eventId_status_idx" ON "Participant"("eventId", "status");

-- CreateIndex
CREATE INDEX "Participant_eventId_score_idx" ON "Participant"("eventId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_eventId_kickUserId_key" ON "Participant"("eventId", "kickUserId");

-- CreateIndex
CREATE INDEX "Answer_eventId_roundIndex_idx" ON "Answer"("eventId", "roundIndex");

-- CreateIndex
CREATE INDEX "Answer_participantId_idx" ON "Answer"("participantId");

-- CreateIndex
CREATE INDEX "ScoreAward_eventId_participantId_idx" ON "ScoreAward"("eventId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreAward_eventId_roundIndex_participantId_reason_key" ON "ScoreAward"("eventId", "roundIndex", "participantId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "EventResult_eventId_key" ON "EventResult"("eventId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "OutboxMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_channelId_createdAt_idx" ON "OutboxMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookIngest_processedAt_idx" ON "WebhookIngest"("processedAt");

-- CreateIndex
CREATE INDEX "WebhookIngest_channelId_idx" ON "WebhookIngest"("channelId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_channelId_idx" ON "AuditLog"("channelId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KickCredential" ADD CONSTRAINT "KickCredential_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionState" ADD CONSTRAINT "ConnectionState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSettings" ADD CONSTRAINT "BotSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreAward" ADD CONSTRAINT "ScoreAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreAward" ADD CONSTRAINT "ScoreAward_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventResult" ADD CONSTRAINT "EventResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
