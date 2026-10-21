CREATE TYPE "WalkRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED');

CREATE TABLE "walk_requests" (
    "id" SERIAL NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "receiver_id" INTEGER NOT NULL,
    "status" "WalkRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),

    CONSTRAINT "walk_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "walk_requests_receiver_id_status_idx" ON "walk_requests"("receiver_id", "status");
CREATE INDEX "walk_requests_requester_id_status_idx" ON "walk_requests"("requester_id", "status");

-- Prisma 7 cannot model expression indexes (LEAST/GREATEST).
CREATE UNIQUE INDEX "walk_requests_pending_pair_key" ON "walk_requests"
    (LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))
    WHERE status = 'PENDING';

ALTER TABLE "walk_requests" ADD CONSTRAINT "walk_requests_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "walk_requests" ADD CONSTRAINT "walk_requests_receiver_id_fkey"
    FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
