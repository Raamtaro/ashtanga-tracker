/*
  Warnings:

  - The values [ADVANCED] on the enum `SequenceGroup` will be removed. If these variants are still used in the database, this will fail.
  - The values [ADVANCED] on the enum `SequenceSegment` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `category` on the `Pose` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PracticeType" ADD VALUE 'HALF_PRIMARY_PLUS_INTERMEDIATE';
ALTER TYPE "PracticeType" ADD VALUE 'ADVANCED_A';
ALTER TYPE "PracticeType" ADD VALUE 'ADVANCED_B';

-- AlterEnum
BEGIN;
CREATE TYPE "SequenceGroup_new" AS ENUM ('WARMUP', 'SUN_SALUTATIONS', 'STANDING', 'PRIMARY', 'INTERMEDIATE', 'ADVANCED_A', 'ADVANCED_B', 'BACKBENDING', 'FINISHING', 'OTHER');
ALTER TABLE "Pose" ALTER COLUMN "sequenceGroup" TYPE "SequenceGroup_new" USING ("sequenceGroup"::text::"SequenceGroup_new");
ALTER TYPE "SequenceGroup" RENAME TO "SequenceGroup_old";
ALTER TYPE "SequenceGroup_new" RENAME TO "SequenceGroup";
DROP TYPE "public"."SequenceGroup_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SequenceSegment_new" AS ENUM ('SUN_A', 'SUN_B', 'STANDING', 'PRIMARY', 'INTERMEDIATE', 'ADVANCED_A', 'ADVANCED_B', 'BACKBENDING', 'FINISHING');
ALTER TABLE "ScoreCard" ALTER COLUMN "segment" TYPE "SequenceSegment_new" USING ("segment"::text::"SequenceSegment_new");
ALTER TYPE "SequenceSegment" RENAME TO "SequenceSegment_old";
ALTER TYPE "SequenceSegment_new" RENAME TO "SequenceSegment";
DROP TYPE "public"."SequenceSegment_old";
COMMIT;

-- AlterTable
ALTER TABLE "Pose" DROP COLUMN "category";

-- DropEnum
DROP TYPE "PoseCategory";
