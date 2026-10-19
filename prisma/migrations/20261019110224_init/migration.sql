-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "kickUserId" INTEGER NOT NULL,
    "kickUsername" TEXT NOT NULL,
    "kickChannelSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Channel_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KickCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "scopes" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KickCredential_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectionState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastCheckedAt" DATETIME,
    "lastHealthyAt" DATETIME,
    "lastError" TEXT,
    "subscriptionsActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectionState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BotSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "commandPrefix" TEXT NOT NULL DEFAULT '!',
    "botDisplayName" TEXT NOT NULL DEFAULT 'البوت',
    "language" TEXT NOT NULL DEFAULT 'ar',
    "sendType" TEXT NOT NULL DEFAULT 'user',
    "minSendIntervalMs" INTEGER NOT NULL DEFAULT 1200,
    "replyToCommands" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BotSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "scheduledStartAt" DATETIME,
    "registrationOpenedAt" DATETIME,
    "registrationClosesAt" DATETIME,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "cancelledAt" DATETIME,
    "currentRoundIndex" INTEGER NOT NULL DEFAULT -1,
    "currentRoundEndsAt" DATETIME,
    "currentRoundRemainingMs" INTEGER,
    "winnerParticipantId" TEXT,
    "winnerTeamName" TEXT,
    "resultOutcome" TEXT,
    "resultComputedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT,
    "correctAnswers" TEXT NOT NULL,
    "timeLimitSec" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "speedBonus" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    CONSTRAINT "Question_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "kickUserId" INTEGER NOT NULL,
    "kickUsername" TEXT NOT NULL,
    "teamName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Participant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "participantId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "rejectedReason" TEXT,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "speedBonus" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Answer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Answer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "participantId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'CORRECT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoreAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreAward_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "winnerParticipantId" TEXT,
    "winnerTeamName" TEXT,
    "standings" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboxMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutboxMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookIngest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "processedAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT,
    "userId" TEXT,
    "eventId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
