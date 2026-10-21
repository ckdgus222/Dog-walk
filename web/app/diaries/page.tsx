"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthGate } from "../_components/auth-gate";
import { useMyDogs } from "../../lib/api/dogs";
import { useDiaries } from "../../lib/api/diaries";
import { DiaryImage } from "./diary-image";
import { formatDiaryDate } from "./diary-date";
import styles from "../_components/shared.module.css";
import diaryStyles from "./diaries.module.css";

const DiaryList = () => {
  const [dogId, setDogId] = useState<number>();
  const dogs = useMyDogs();
  const query = useDiaries(dogId);

  return (
    <>
      <Link href="/diaries/new">일기 쓰기</Link>
      <label>
        반려견 고르기
        <select
          value={dogId ?? ""}
          onChange={(event) =>
            setDogId(
              event.target.value ? Number(event.target.value) : undefined,
            )
          }
        >
          <option value="">전체</option>
          {dogs.data?.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dog.name}
            </option>
          ))}
        </select>
      </label>
      {dogs.error && <p role="alert">{dogs.error.message}</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">일기를 불러오고 있어요.</p>}
      {query.isSuccess && query.data.length === 0 && <p>아직 일기가 없어요.</p>}
      <div className={styles.cards}>
        {query.data?.map((diary) => (
          <article key={diary.id} className={styles.card}>
            <Link href={`/diaries/${diary.id}`}>
              <h2>{formatDiaryDate(diary.walkedOn)}</h2>
              <p>{diary.dog.name}</p>
              <p>
                {diary.content.slice(0, 100)}
                {diary.content.length > 100 ? "…" : ""}
              </p>
              {diary.images[0] && (
                <DiaryImage
                  diaryId={diary.id}
                  imageId={diary.images[0].id}
                  alt={`${diary.dog.name} 일기 첫 사진`}
                  className={diaryStyles.thumbnail}
                />
              )}
              <p>사진 {diary.images.length}장</p>
            </Link>
          </article>
        ))}
      </div>
    </>
  );
};

const DiariesPage = () => (
  <main className={styles.main}>
    <h1>일기</h1>
    <AuthGate>
      <DiaryList />
    </AuthGate>
    <Link href="/">홈으로</Link>
  </main>
);
export default DiariesPage;
