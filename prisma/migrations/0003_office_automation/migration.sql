-- AlterTable
ALTER TABLE "offices" ADD COLUMN     "auto_clear" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "daily_digest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "office_deadlines" ADD COLUMN     "auto_clear_warned_at" TIMESTAMPTZ(3);
