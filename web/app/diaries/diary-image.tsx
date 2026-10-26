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
  const diaryImage = useDiaryImage(diaryId, imageId);
  if (diaryImage.error) return <p role="alert">{diaryImage.error.message}</p>;
  if (!diaryImage.data) return <p role="status">사진을 불러오고 있어요.</p>;
  return <BlobImage blob={diaryImage.data} alt={alt} className={className} />;
};
