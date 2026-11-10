-- CreateEnum
CREATE TYPE "PasswordRequestStatus" AS ENUM ('pending', 'approved', 'declined', 'used', 'cancelled', 'withdrawn');

-- CreateTable
CREATE TABLE "password_requests" (
    "request_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code" CHAR(6) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "PasswordRequestStatus" NOT NULL DEFAULT 'pending',
    "ip_address" VARCHAR(45) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_by" INTEGER,
    "decided_at" TIMESTAMPTZ(3),
    "approved_until" TIMESTAMPTZ(3),
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "password_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_requests_token_hash_key" ON "password_requests"("token_hash");

-- CreateIndex
CREATE INDEX "password_requests_status_created_at_idx" ON "password_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "password_requests_user_id_idx" ON "password_requests"("user_id");

-- AddForeignKey
ALTER TABLE "password_requests" ADD CONSTRAINT "password_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_requests" ADD CONSTRAINT "password_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
