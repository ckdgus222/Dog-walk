"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../_components/auth-gate";
import { DogFace, genderLabels } from "../../_components/dog-card";
import headingStyles from "../../_components/heading.module.css";
import layoutStyles from "../../_components/layout.module.css";
import { useMyDogs } from "../../../lib/api/dogs";
import { useDeleteDiary, useDiary } from "../../../lib/api/diaries";
import { DiaryImage } from "../diary-image";
import { formatDiaryDate } from "../diary-date";
import styles from "../diaries.module.css";

const DiaryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const query = useDiary(Number(id));
  const dogs = useMyDogs();
  const remove = useDeleteDiary();
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p role="status">일기를 불러오고 있어요.</p>;
  const diary = query.data;
  const order = dogs.data?.findIndex((dog) => dog.id === diary.dog.id) ?? -1;
  const dog = dogs.data?.[order];

  return (
    <>
      <h1 className={headingStyles.title}>{formatDiaryDate(diary.walkedOn)}</h1>
      <div className={styles.meta}>
        <div className={styles.dog}>
          {dog && (
            <DogFace
              dog={dog}
              className={styles.face}
              size={80}
              order={order}
            />
          )}
          <div>
            <p>{diary.dog.name}</p>
            {dog && (
              <span>
                {dog.breed} · {genderLabels[dog.gender]} · {dog.birthYear}년생
              </span>
            )}
          </div>
        </div>
        <span className={styles.private}>나만 보는 기록</span>
      </div>
      <p className={styles.content}>{diary.content}</p>
      <div className={styles.photos}>
        {diary.images.map((image, index) => (
          <DiaryImage
            key={image.id}
            diaryId={diary.id}
            imageId={image.id}
            alt={`일기 사진 ${index + 1}`}
            className={styles.photo}
          />
        ))}
      </div>
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
  <main className={layoutStyles.main}>
    <Link href="/diaries" className={layoutStyles.back}>
      <span aria-hidden="true">‹</span>일기 목록
    </Link>
    <AuthGate>
      <Suspense fallback={<p role="status">일기를 불러오고 있어요.</p>}>
        <DiaryDetail />
      </Suspense>
    </AuthGate>
  </main>
);
export default DiaryPage;
