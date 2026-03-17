-- Ensure PoseInsight table exists (for databases where this model was added outside migrations)
CREATE TABLE IF NOT EXISTS "PoseInsight" (
    "id" TEXT NOT NULL,
    "poseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timeframeStart" TIMESTAMP(3),
    "timeframeEndExclusive" TIMESTAMP(3),
    "totalDays" INTEGER,
    "timeZone" TEXT,
    "computed" JSONB,
    "llmInput" JSONB,
    "ai" JSONB,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PoseInsight_pkey" PRIMARY KEY ("id")
);

-- Ensure WeeklyInsight table exists
CREATE TABLE IF NOT EXISTS "WeeklyInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEndExclusive" TIMESTAMP(3),
    "weekStartsOn" TEXT,
    "timeZone" TEXT,
    "includeDrafts" BOOLEAN,
    "computed" JSONB,
    "llmInput" JSONB,
    "ai" JSONB,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyInsight_pkey" PRIMARY KEY ("id")
);

-- Add missing columns on pre-existing tables
ALTER TABLE "PoseInsight"
    ADD COLUMN IF NOT EXISTS "timeframeStart" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "timeframeEndExclusive" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "totalDays" INTEGER,
    ADD COLUMN IF NOT EXISTS "timeZone" TEXT,
    ADD COLUMN IF NOT EXISTS "computed" JSONB,
    ADD COLUMN IF NOT EXISTS "llmInput" JSONB,
    ADD COLUMN IF NOT EXISTS "ai" JSONB,
    ADD COLUMN IF NOT EXISTS "model" TEXT,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WeeklyInsight"
    ADD COLUMN IF NOT EXISTS "weekEndExclusive" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "weekStartsOn" TEXT,
    ADD COLUMN IF NOT EXISTS "timeZone" TEXT,
    ADD COLUMN IF NOT EXISTS "includeDrafts" BOOLEAN,
    ADD COLUMN IF NOT EXISTS "computed" JSONB,
    ADD COLUMN IF NOT EXISTS "llmInput" JSONB,
    ADD COLUMN IF NOT EXISTS "ai" JSONB,
    ADD COLUMN IF NOT EXISTS "model" TEXT,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill newly required values
UPDATE "PoseInsight"
SET
    "timeframeStart" = COALESCE("timeframeStart", "createdAt"),
    "timeframeEndExclusive" = COALESCE("timeframeEndExclusive", ("createdAt" + INTERVAL '30 days')),
    "totalDays" = COALESCE("totalDays", 30),
    "timeZone" = COALESCE("timeZone", 'UTC'),
    "ai" = COALESCE("ai", '{}'::jsonb);

UPDATE "WeeklyInsight"
SET
    "weekEndExclusive" = COALESCE("weekEndExclusive", ("weekStart" + INTERVAL '7 days')),
    "weekStartsOn" = COALESCE("weekStartsOn", 'MONDAY'),
    "timeZone" = COALESCE("timeZone", 'UTC'),
    "includeDrafts" = COALESCE("includeDrafts", false),
    "ai" = COALESCE("ai", '{}'::jsonb);

-- Enforce final nullability/defaults
ALTER TABLE "PoseInsight"
    ALTER COLUMN "timeframeStart" SET NOT NULL,
    ALTER COLUMN "timeframeEndExclusive" SET NOT NULL,
    ALTER COLUMN "totalDays" SET NOT NULL,
    ALTER COLUMN "timeZone" SET NOT NULL,
    ALTER COLUMN "timeZone" SET DEFAULT 'UTC',
    ALTER COLUMN "ai" SET NOT NULL;

ALTER TABLE "WeeklyInsight"
    ALTER COLUMN "weekEndExclusive" SET NOT NULL,
    ALTER COLUMN "weekStartsOn" SET NOT NULL,
    ALTER COLUMN "weekStartsOn" SET DEFAULT 'MONDAY',
    ALTER COLUMN "timeZone" SET NOT NULL,
    ALTER COLUMN "timeZone" SET DEFAULT 'UTC',
    ALTER COLUMN "includeDrafts" SET NOT NULL,
    ALTER COLUMN "includeDrafts" SET DEFAULT false,
    ALTER COLUMN "ai" SET NOT NULL;

-- Add missing foreign keys safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoseInsight_poseId_fkey') THEN
        ALTER TABLE "PoseInsight"
            ADD CONSTRAINT "PoseInsight_poseId_fkey"
            FOREIGN KEY ("poseId") REFERENCES "Pose"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PoseInsight_userId_fkey') THEN
        ALTER TABLE "PoseInsight"
            ADD CONSTRAINT "PoseInsight_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyInsight_userId_fkey') THEN
        ALTER TABLE "WeeklyInsight"
            ADD CONSTRAINT "WeeklyInsight_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Idempotent indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PoseInsight_userId_poseId_timeframeStart_timeframeEndExclusive_timeZone_key"
    ON "PoseInsight"("userId", "poseId", "timeframeStart", "timeframeEndExclusive", "timeZone");

CREATE INDEX IF NOT EXISTS "PoseInsight_userId_createdAt_idx"
    ON "PoseInsight"("userId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyInsight_userId_weekStart_weekEndExclusive_weekStartsOn_timeZone_includeDrafts_key"
    ON "WeeklyInsight"("userId", "weekStart", "weekEndExclusive", "weekStartsOn", "timeZone", "includeDrafts");

CREATE INDEX IF NOT EXISTS "WeeklyInsight_userId_createdAt_idx"
    ON "WeeklyInsight"("userId", "createdAt");
