ALTER TABLE "users"
ADD COLUMN "location" geography(Point, 4326),
ADD COLUMN "location_consented_at" TIMESTAMPTZ(3),
ADD COLUMN "location_updated_at" TIMESTAMPTZ(3);

CREATE INDEX "users_location_idx" ON "users" USING GIST ("location");
