/*
  Warnings:

  - You are about to drop the `WeeklySummary` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WeeklySummary" DROP CONSTRAINT "WeeklySummary_userId_fkey";

-- AlterTable
ALTER TABLE "PoseInsight" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ScoreCard" ADD COLUMN     "scored" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WeeklyInsight" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "WeeklySummary";

-- RenameIndex
ALTER INDEX "PoseInsight_userId_poseId_timeframeStart_timeframeEndExclusive_" RENAME TO "PoseInsight_userId_poseId_timeframeStart_timeframeEndExclus_key";

-- RenameIndex
ALTER INDEX "WeeklyInsight_userId_weekStart_weekEndExclusive_weekStartsOn_ti" RENAME TO "WeeklyInsight_userId_weekStart_weekEndExclusive_weekStartsO_key";
