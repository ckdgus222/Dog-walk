"use client";

import { useDiaryImage } from "../../lib/api/diaries";
import { BlobImage } from "../_components/blob-image";

// Diary photos are private, so they come through an authenticated fetch.
export const DiaryImage = ({
  diaryId,
  imageId,
  alt,
  className,
}: {
  diaryId: number;
  imageId: number;
  alt: string;
  className: string;
}) => {
  const query = useDiaryImage(diaryId, imageId);
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p role="status">사진을 불러오고 있어요.</p>;
  return <BlobImage blob={query.data} alt={alt} className={className} />;
};
