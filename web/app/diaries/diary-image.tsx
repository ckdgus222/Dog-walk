"use client";

import { useEffect, useRef } from "react";
import { useDiaryImage } from "../../lib/api/diaries";
import styles from "../_components/shared.module.css";

export const DiaryImage = ({
  diaryId,
  imageId,
  alt,
  className = styles.photo,
}: {
  diaryId: number;
  imageId: number;
  alt: string;
  className?: string;
}) => {
  const query = useDiaryImage(diaryId, imageId);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!query.data || !image.current) return;
    const element = image.current;
    const url = URL.createObjectURL(query.data);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [query.data]);

  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p role="status">사진을 불러오고 있어요.</p>;
  // Protected images require an authenticated fetch before displaying the Blob.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} className={className} alt={alt} />;
};
