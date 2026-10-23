"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthGate } from "../_components/auth-gate";
import { DogFace } from "../_components/dog-card";
import { EmptyState } from "../_components/empty-state";
import headingStyles from "../_components/heading.module.css";
import { ArrowRight } from "../_components/icons";
import formStyles from "../_components/form.module.css";
import layoutStyles from "../_components/layout.module.css";
import { useMyDogs } from "../../lib/api/dogs";
import { useDiaries } from "../../lib/api/diaries";
import { DiaryImage } from "./diary-image";
import { formatListDate } from "./diary-date";
import diaryBook from "../../public/illustrations/walking-drawing/diary-book.svg";
import styles from "./diaries.module.css";

const DiaryList = () => {
  const [dogId, setDogId] = useState<number>();
  const dogs = useMyDogs();
  const query = useDiaries(dogId);

  return (
    <>
      <div role="group" aria-label="반려견 고르기" className={styles.filters}>
        <button
          type="button"
          aria-pressed={dogId === undefined}
          onClick={() => setDogId(undefined)}
        >
          전체
        </button>
        {dogs.data?.map((dog) => (
          <button
            key={dog.id}
            type="button"
            aria-pressed={dogId === dog.id}
            onClick={() => setDogId(dog.id)}
          >
            {dog.name}
          </button>
        ))}
      </div>
      {dogs.error && <p role="alert">{dogs.error.message}</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">일기를 불러오고 있어요.</p>}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState
          image={diaryBook}
          title="아직 일기가 없어요."
          description="오늘 산책은 어땠나요? 첫 기록을 남겨 보세요."
          action={{ href: "/diaries/new", label: "첫 일기 쓰기" }}
        />
      )}
      {!!query.data?.length && (
        <div className={styles.list}>
          {query.data.map((diary) => {
            const order =
              dogs.data?.findIndex((dog) => dog.id === diary.dog.id) ?? -1;
            const dog = dogs.data?.[order];
            return (
              <article key={diary.id} className={styles.entry}>
                <Link href={`/diaries/${diary.id}`}>
                  <div className={styles.text}>
                    <h2>{formatListDate(diary.walkedOn)}</h2>
                    <div className={styles.dog}>
                      {dog && (
                        <DogFace
                          dog={dog}
                          className={styles.face}
                          size={64}
                          order={order}
                        />
                      )}
                      <p>{diary.dog.name}</p>
                    </div>
                    <p className={styles.excerpt}>
                      {diary.content.slice(0, 100)}
                      {diary.content.length > 100 ? "…" : ""}
                    </p>
                    {!diary.images[0] && (
                      <p className={styles.noPhoto}>사진 0장</p>
                    )}
                  </div>
                  {diary.images[0] && (
                    // The first two photos, a wide one and a narrow one. The
                    // count badge sits on the last one shown.
                    <div className={styles.cover}>
                      {diary.images.slice(0, 2).map((image, index) => (
                        <DiaryImage
                          key={image.id}
                          diaryId={diary.id}
                          imageId={image.id}
                          alt={`${diary.dog.name} 일기 ${index === 0 ? "첫" : "두 번째"} 사진`}
                          className={styles.coverImage}
                        />
                      ))}
                      <p>
                        <span className={formStyles.visuallyHidden}>사진 </span>
                        {diary.images.length}장
                      </p>
                    </div>
                  )}
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
};

const DiariesPage = () => (
  <main className={layoutStyles.main}>
    <div className={`${layoutStyles.head} ${styles.head}`}>
      <div>
        <h1 className={headingStyles.title}>산책 일기</h1>
        <p className={headingStyles.lead}>나만 보는 기록</p>
      </div>
      <Link
        href="/diaries/new"
        className={`${layoutStyles.headAction} ${styles.write}`}
      >
        일기 쓰기
        <ArrowRight />
      </Link>
    </div>
    <AuthGate>
      <DiaryList />
    </AuthGate>
  </main>
);
export default DiariesPage;
