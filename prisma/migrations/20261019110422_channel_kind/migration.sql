-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "kickUserId" INTEGER NOT NULL,
    "kickUsername" TEXT NOT NULL,
    "kickChannelSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'KICK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Channel_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Channel" ("createdAt", "id", "kickChannelSlug", "kickUserId", "kickUsername", "ownerUserId") SELECT "createdAt", "id", "kickChannelSlug", "kickUserId", "kickUsername", "ownerUserId" FROM "Channel";
DROP TABLE "Channel";
ALTER TABLE "new_Channel" RENAME TO "Channel";
CREATE UNIQUE INDEX "Channel_kickUserId_key" ON "Channel"("kickUserId");
CREATE INDEX "Channel_ownerUserId_idx" ON "Channel"("ownerUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
