/*
  Warnings:

  - The values [PRIMARY_PLUS_INTERMEDIATE,FULL_INTERMEDIATE,INTERMEDIATE_PLUS_ADVANCED,HALF_PRIMARY_PLUS_INTERMEDIATE] on the enum `PracticeType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PracticeType_new" AS ENUM ('FULL_PRIMARY', 'HALF_PRIMARY', 'INTERMEDIATE', 'ADVANCED_A', 'ADVANCED_B', 'CUSTOM');
ALTER TABLE "PracticeSession" ALTER COLUMN "practiceType" TYPE "PracticeType_new" USING ("practiceType"::text::"PracticeType_new");
ALTER TYPE "PracticeType" RENAME TO "PracticeType_old";
ALTER TYPE "PracticeType_new" RENAME TO "PracticeType";
DROP TYPE "public"."PracticeType_old";
COMMIT;
