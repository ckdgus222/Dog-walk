CREATE TABLE "diaries" (
    "id" SERIAL NOT NULL,
    "author_id" INTEGER NOT NULL,
    "dog_id" INTEGER NOT NULL,
    "walked_on" DATE NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diary_images" (
    "id" SERIAL NOT NULL,
    "diary_id" INTEGER NOT NULL,
    "file_name" VARCHAR NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "diary_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "diaries_author_id_walked_on_idx" ON "diaries"("author_id", "walked_on");
CREATE INDEX "diaries_dog_id_idx" ON "diaries"("dog_id");
CREATE INDEX "diary_images_diary_id_idx" ON "diary_images"("diary_id");

ALTER TABLE "diaries" ADD CONSTRAINT "diaries_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_dog_id_fkey"
    FOREIGN KEY ("dog_id") REFERENCES "dogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diary_images" ADD CONSTRAINT "diary_images_diary_id_fkey"
    FOREIGN KEY ("diary_id") REFERENCES "diaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
