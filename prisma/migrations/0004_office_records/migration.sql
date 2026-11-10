-- CreateTable
CREATE TABLE "office_records" (
    "record_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(3),
    "settled_by" INTEGER,
    "settle_note" VARCHAR(120),

    CONSTRAINT "office_records_pkey" PRIMARY KEY ("record_id")
);

-- CreateIndex
CREATE INDEX "office_records_item_id_idx" ON "office_records"("item_id");

-- AddForeignKey
ALTER TABLE "office_records" ADD CONSTRAINT "office_records_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "clearance_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_records" ADD CONSTRAINT "office_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_records" ADD CONSTRAINT "office_records_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

