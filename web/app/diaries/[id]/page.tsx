"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../_components/auth-gate";
import { useDeleteDiary, useDiary } from "../../../lib/api/diaries";
import { DiaryImage } from "../diary-image";
import { formatDiaryDate } from "../diary-date";
import styles from "../../_components/shared.module.css";
import diaryStyles from "../diaries.module.css";

const DiaryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const query = useDiary(Number(id));
  const remove = useDeleteDiary();
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p role="status">일기를 불러오고 있어요.</p>;
  const diary = query.data;

  return (
    <>
      <h2>{formatDiaryDate(diary.walkedOn)}</h2>
      <p>{diary.dog.name}</p>
      <p className={diaryStyles.content}>{diary.content}</p>
      {diary.images.map((image, index) => (
        <DiaryImage
          key={image.id}
          diaryId={diary.id}
          imageId={image.id}
          alt={`일기 사진 ${index + 1}`}
        />
      ))}
      <div className={styles.actions}>
        <Link href={`/diaries/${diary.id}/edit`}>수정</Link>
        <button
          disabled={remove.isPending}
          onClick={() => {
            if (!window.confirm("일기를 삭제할까요?")) return;
            remove.mutate(diary.id, {
              onSuccess: () => router.push("/diaries"),
            });
          }}
        >
          {remove.isPending ? "삭제 중…" : "삭제"}
        </button>
      </div>
      {remove.error && <p role="alert">{remove.error.message}</p>}
    </>
  );
};

const DiaryPage = () => (
  <main className={styles.main}>
    <h1>일기 상세</h1>
    <AuthGate>
      <Suspense fallback={<p role="status">일기를 불러오고 있어요.</p>}>
        <DiaryDetail />
      </Suspense>
    </AuthGate>
    <Link href="/diaries">일기 목록</Link>
  </main>
);
export default DiaryPage;
