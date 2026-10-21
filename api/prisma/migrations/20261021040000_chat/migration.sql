CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "walk_request_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_walk_request_id_created_at_idx" ON "chat_messages"("walk_request_id", "created_at");

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_walk_request_id_fkey"
    FOREIGN KEY ("walk_request_id") REFERENCES "walk_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
