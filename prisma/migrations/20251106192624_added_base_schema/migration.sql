-- CreateEnum
CREATE TYPE "InjurySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "PoseCategory" AS ENUM ('SUN_A', 'SUN_B', 'STANDING', 'PRIMARY', 'INTERMEDIATE', 'ADVANCED_A', 'ADVANCED_B', 'ADVANCED_C', 'ADVANCED_D', 'FINISHING', 'BACKBENDING', 'OTHER');

-- CreateEnum
CREATE TYPE "SequenceGroup" AS ENUM ('WARMUP', 'SUN_SALUTATIONS', 'STANDING', 'PRIMARY', 'INTERMEDIATE', 'ADVANCED', 'BACKBENDING', 'FINISHING', 'OTHER');

-- CreateEnum
CREATE TYPE "PracticeType" AS ENUM ('FULL_PRIMARY', 'HALF_PRIMARY', 'PRIMARY_PLUS_INTERMEDIATE', 'FULL_INTERMEDIATE', 'INTERMEDIATE_PLUS_ADVANCED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SequenceSegment" AS ENUM ('SUN_A', 'SUN_B', 'STANDING', 'PRIMARY', 'INTERMEDIATE', 'ADVANCED', 'BACKBENDING', 'FINISHING');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('LEFT', 'RIGHT', 'BOTH', 'NA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ageYears" INTEGER,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "notes" TEXT,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Injury" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyArea" TEXT,
    "severity" "InjurySeverity" NOT NULL DEFAULT 'MILD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Injury_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pose" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sanskritName" TEXT NOT NULL,
    "englishName" TEXT,
    "category" "PoseCategory" NOT NULL,
    "sequenceGroup" "SequenceGroup" NOT NULL,
    "orderInGroup" INTEGER,
    "isTwoSided" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Pose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "practiceType" "PracticeType",
    "durationMinutes" INTEGER,
    "overallScore" DOUBLE PRECISION,
    "energyLevel" INTEGER,
    "mood" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreCard" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "poseId" TEXT NOT NULL,
    "orderInSession" INTEGER NOT NULL,
    "segment" "SequenceSegment",
    "side" "Side",
    "ease" INTEGER,
    "comfort" INTEGER,
    "stability" INTEGER,
    "pain" INTEGER,
    "breath" INTEGER,
    "focus" INTEGER,
    "overallScore" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Pose_slug_key" ON "Pose"("slug");

-- CreateIndex
CREATE INDEX "PracticeSession_userId_date_idx" ON "PracticeSession"("userId", "date");

-- CreateIndex
CREATE INDEX "ScoreCard_sessionId_idx" ON "ScoreCard"("sessionId");

-- CreateIndex
CREATE INDEX "ScoreCard_poseId_idx" ON "ScoreCard"("poseId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Injury" ADD CONSTRAINT "Injury_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCard" ADD CONSTRAINT "ScoreCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCard" ADD CONSTRAINT "ScoreCard_poseId_fkey" FOREIGN KEY ("poseId") REFERENCES "Pose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
