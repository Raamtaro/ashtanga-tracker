/*
  Warnings:

  - A unique constraint covering the columns `[id,userId]` on the table `PracticeSession` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PracticeSession_id_userId_key" ON "PracticeSession"("id", "userId");
