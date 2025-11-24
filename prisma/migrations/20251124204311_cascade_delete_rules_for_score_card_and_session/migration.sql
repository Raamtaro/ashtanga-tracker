-- DropForeignKey
ALTER TABLE "Injury" DROP CONSTRAINT "Injury_profileId_fkey";

-- DropForeignKey
ALTER TABLE "PracticeSession" DROP CONSTRAINT "PracticeSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "ScoreCard" DROP CONSTRAINT "ScoreCard_poseId_fkey";

-- DropForeignKey
ALTER TABLE "ScoreCard" DROP CONSTRAINT "ScoreCard_sessionId_fkey";

-- AddForeignKey
ALTER TABLE "Injury" ADD CONSTRAINT "Injury_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCard" ADD CONSTRAINT "ScoreCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCard" ADD CONSTRAINT "ScoreCard_poseId_fkey" FOREIGN KEY ("poseId") REFERENCES "Pose"("id") ON DELETE CASCADE ON UPDATE CASCADE;
