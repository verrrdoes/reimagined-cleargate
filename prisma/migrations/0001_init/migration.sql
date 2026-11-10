-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('student', 'staff', 'admin');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('Male', 'Female');

-- CreateEnum
CREATE TYPE "Term" AS ENUM ('first_semester', 'second_semester', 'summer');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('needs_action', 'pending', 'approved');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('submitted', 'approved', 'returned', 'replaced');

-- CreateEnum
CREATE TYPE "NotificationTone" AS ENUM ('needs_action', 'pending', 'approved', 'info');

-- CreateEnum
CREATE TYPE "ReminderAudience" AS ENUM ('outstanding', 'overdue', 'student');

-- CreateEnum
CREATE TYPE "AlertStage" AS ENUM ('three_days', 'one_day', 'overdue');

-- CreateTable
CREATE TABLE "programs" (
    "program_id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("program_id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "academic_year_id" SERIAL NOT NULL,
    "label" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("academic_year_id")
);

-- CreateTable
CREATE TABLE "offices" (
    "office_id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(20) NOT NULL DEFAULT 'file',
    "contact_email" VARCHAR(190) NOT NULL,
    "office_hours" VARCHAR(80) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("office_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "email" VARCHAR(190) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "full_name" VARCHAR(120),
    "personal_email" VARCHAR(190),
    "phone" VARCHAR(20),
    "avatar_name" VARCHAR(200),
    "avatar_mime" VARCHAR(40),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" CHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "application_id" SERIAL NOT NULL,
    "reference" VARCHAR(20),
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "status_token" CHAR(64) NOT NULL,
    "photo_name" VARCHAR(200),
    "photo_mime" VARCHAR(30),
    "admission_type" VARCHAR(40) NOT NULL,
    "program_id" INTEGER NOT NULL,
    "year_level" SMALLINT NOT NULL,
    "last_name" VARCHAR(60) NOT NULL,
    "first_name" VARCHAR(60) NOT NULL,
    "middle_name" VARCHAR(60),
    "suffix" VARCHAR(10),
    "sex" "Sex" NOT NULL,
    "civil_status" VARCHAR(20) NOT NULL,
    "birthday" DATE NOT NULL,
    "place_of_birth" VARCHAR(120),
    "personal_email" VARCHAR(190) NOT NULL,
    "contact_number" VARCHAR(20) NOT NULL,
    "religion" VARCHAR(60),
    "permanent_address" VARCHAR(255),
    "region" VARCHAR(80) NOT NULL,
    "province" VARCHAR(80) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "barangay" VARCHAR(80) NOT NULL,
    "street" VARCHAR(160) NOT NULL,
    "postal_code" VARCHAR(10),
    "father_first" VARCHAR(60) NOT NULL,
    "father_middle" VARCHAR(60),
    "father_last" VARCHAR(60) NOT NULL,
    "father_occupation" VARCHAR(80) NOT NULL,
    "mother_first" VARCHAR(60) NOT NULL,
    "mother_middle" VARCHAR(60),
    "mother_last" VARCHAR(60) NOT NULL,
    "mother_occupation" VARCHAR(80) NOT NULL,
    "guardian_first" VARCHAR(60) NOT NULL,
    "guardian_middle" VARCHAR(60),
    "guardian_last" VARCHAR(60) NOT NULL,
    "guardian_relationship" VARCHAR(40) NOT NULL,
    "guardian_contact" VARCHAR(20) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMPTZ(3),
    "reject_reason" VARCHAR(255),
    "user_id" INTEGER,
    "temp_password" VARCHAR(40),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "students" (
    "student_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "student_number" VARCHAR(20) NOT NULL,
    "first_name" VARCHAR(60) NOT NULL,
    "last_name" VARCHAR(60) NOT NULL,
    "program_id" INTEGER NOT NULL,
    "year_level" SMALLINT NOT NULL,
    "application_id" INTEGER,
    "current_address" VARCHAR(255),
    "emergency_name" VARCHAR(120),
    "emergency_contact" VARCHAR(20),

    CONSTRAINT "students_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "office_staff" (
    "user_id" INTEGER NOT NULL,
    "office_id" INTEGER NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "position" VARCHAR(80),

    CONSTRAINT "office_staff_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "clearances" (
    "clearance_id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "academic_year_id" INTEGER NOT NULL,
    "term" "Term" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clearances_pkey" PRIMARY KEY ("clearance_id")
);

-- CreateTable
CREATE TABLE "clearance_items" (
    "item_id" SERIAL NOT NULL,
    "clearance_id" INTEGER NOT NULL,
    "office_id" INTEGER NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'pending',
    "task" VARCHAR(160) NOT NULL,
    "remarks" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "next_step" VARCHAR(255),
    "due_at" TIMESTAMPTZ(3),
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(3),

    CONSTRAINT "clearance_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "clearance_item_logs" (
    "log_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "old_status" "ItemStatus",
    "new_status" "ItemStatus" NOT NULL,
    "note" VARCHAR(255),
    "changed_by" INTEGER,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clearance_item_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "submission_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "reference" VARCHAR(20),
    "stored_name" VARCHAR(200) NOT NULL,
    "original_name" VARCHAR(160) NOT NULL,
    "mime_type" VARCHAR(60) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "student_note" VARCHAR(255),
    "status" "SubmissionStatus" NOT NULL DEFAULT 'submitted',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMPTZ(3),
    "return_category" VARCHAR(80),
    "review_note" VARCHAR(500),
    "checklist" JSONB,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("submission_id")
);

-- CreateTable
CREATE TABLE "office_messages" (
    "message_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "sender_id" INTEGER,
    "sender_role" "Role" NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "office_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "tone" "NotificationTone" NOT NULL DEFAULT 'info',
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(255) NOT NULL,
    "link" VARCHAR(255),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "reset_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("reset_id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "attempt_id" SERIAL NOT NULL,
    "login" VARCHAR(190) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "action_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(60) NOT NULL,
    "details" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("action_id")
);

-- CreateTable
CREATE TABLE "office_deadlines" (
    "deadline_id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "academic_year_id" INTEGER NOT NULL,
    "term" "Term" NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(255),
    "set_by" INTEGER,
    "passed_notified_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_deadlines_pkey" PRIMARY KEY ("deadline_id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "reminder_id" SERIAL NOT NULL,
    "office_id" INTEGER,
    "item_id" INTEGER,
    "academic_year_id" INTEGER NOT NULL,
    "term" "Term" NOT NULL,
    "audience" "ReminderAudience" NOT NULL,
    "message" VARCHAR(255) NOT NULL,
    "send_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "recipients" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("reminder_id")
);

-- CreateTable
CREATE TABLE "deadline_alerts" (
    "item_id" INTEGER NOT NULL,
    "stage" "AlertStage" NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadline_alerts_pkey" PRIMARY KEY ("item_id","stage","due_at")
);

-- CreateTable
CREATE TABLE "job_state" (
    "name" TEXT NOT NULL,
    "last_run_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_state_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_label_key" ON "academic_years"("label");

-- CreateIndex
CREATE UNIQUE INDEX "offices_code_key" ON "offices"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personal_email_key" ON "users"("personal_email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_reference_key" ON "applications"("reference");

-- CreateIndex
CREATE INDEX "applications_status_submitted_at_idx" ON "applications"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "applications_personal_email_idx" ON "applications"("personal_email");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_number_key" ON "students"("student_number");

-- CreateIndex
CREATE INDEX "students_program_id_idx" ON "students"("program_id");

-- CreateIndex
CREATE INDEX "office_staff_office_id_idx" ON "office_staff"("office_id");

-- CreateIndex
CREATE INDEX "clearances_academic_year_id_idx" ON "clearances"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "clearances_student_id_academic_year_id_term_key" ON "clearances"("student_id", "academic_year_id", "term");

-- CreateIndex
CREATE INDEX "clearance_items_office_id_status_idx" ON "clearance_items"("office_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_items_clearance_id_office_id_key" ON "clearance_items"("clearance_id", "office_id");

-- CreateIndex
CREATE INDEX "clearance_item_logs_item_id_changed_at_idx" ON "clearance_item_logs"("item_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_reference_key" ON "submissions"("reference");

-- CreateIndex
CREATE INDEX "submissions_item_id_submitted_at_idx" ON "submissions"("item_id", "submitted_at");

-- CreateIndex
CREATE INDEX "submissions_status_submitted_at_idx" ON "submissions"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "submissions_reviewed_at_idx" ON "submissions"("reviewed_at");

-- CreateIndex
CREATE INDEX "office_messages_item_id_created_at_idx" ON "office_messages"("item_id", "created_at");

-- CreateIndex
CREATE INDEX "office_messages_read_at_sender_role_idx" ON "office_messages"("read_at", "sender_role");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_link_idx" ON "notifications"("link");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_login_attempted_at_idx" ON "login_attempts"("login", "attempted_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_address_attempted_at_idx" ON "login_attempts"("ip_address", "attempted_at");

-- CreateIndex
CREATE INDEX "admin_actions_created_at_idx" ON "admin_actions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "office_deadlines_office_id_academic_year_id_term_key" ON "office_deadlines"("office_id", "academic_year_id", "term");

-- CreateIndex
CREATE INDEX "reminders_sent_at_cancelled_at_send_at_idx" ON "reminders"("sent_at", "cancelled_at", "send_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_staff" ADD CONSTRAINT "office_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_staff" ADD CONSTRAINT "office_staff_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_clearance_id_fkey" FOREIGN KEY ("clearance_id") REFERENCES "clearances"("clearance_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("office_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_item_logs" ADD CONSTRAINT "clearance_item_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clearance_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_item_logs" ADD CONSTRAINT "clearance_item_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clearance_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_messages" ADD CONSTRAINT "office_messages_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clearance_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_messages" ADD CONSTRAINT "office_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clearance_items"("item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_deadlines" ADD CONSTRAINT "office_deadlines_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("office_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_deadlines" ADD CONSTRAINT "office_deadlines_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("academic_year_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_deadlines" ADD CONSTRAINT "office_deadlines_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("office_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clearance_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("academic_year_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_alerts" ADD CONSTRAINT "deadline_alerts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clearance_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Constraints Prisma cannot express (HANDOFF §4)
ALTER TABLE "academic_years" ADD CONSTRAINT "ck_academic_years_dates" CHECK ("end_date" > "start_date");
ALTER TABLE "applications"   ADD CONSTRAINT "ck_applications_year"  CHECK ("year_level" BETWEEN 1 AND 4);
ALTER TABLE "students"       ADD CONSTRAINT "ck_students_year"      CHECK ("year_level" BETWEEN 1 AND 4);
-- At most one current academic year (legacy enforced this only in code):
CREATE UNIQUE INDEX "uq_academic_years_one_current" ON "academic_years" ("is_current") WHERE "is_current";
