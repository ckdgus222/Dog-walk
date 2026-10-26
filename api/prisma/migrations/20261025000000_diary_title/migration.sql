ALTER TABLE "diaries" ADD COLUMN "title" VARCHAR(50);

UPDATE "diaries"
SET "title" = EXTRACT(MONTH FROM "walked_on")::integer || '월 '
  || EXTRACT(DAY FROM "walked_on")::integer || '일 산책';

ALTER TABLE "diaries" ALTER COLUMN "title" SET NOT NULL;
