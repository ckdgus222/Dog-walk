"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../_components/auth-gate";
import { dangerButton, secondaryButton } from "../../_components/buttons";
import { DogFace, genderLabels } from "../../_components/dog-card";
import headingStyles from "../../_components/heading.module.css";
import { ArrowLeft, ChevronLeft, LockIcon } from "../../_components/icons";
import layoutStyles from "../../_components/layout.module.css";
import uiStyles from "../../_components/ui.module.css";
import { useMyDogs } from "../../../lib/api/dogs";
import { useDeleteDiary, useDiary } from "../../../lib/api/diaries";
import { DiaryImage } from "../diary-image";
import { formatTitleDate } from "../diary-date";
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

  // The title and actions on top, then the photos beside the text, each
  // scrolling in its own column so a long diary never scrolls the page.
  return (
    <>
      <div className={styles.detailHead}>
        <div>
          <h1 className={headingStyles.title}>{diary.title}</h1>
          <p className={styles.detailMeta}>
            {dog && (
              <DogFace
                dog={dog}
                className={uiStyles.face}
                size={40}
                order={order}
              />
            )}
            <strong>{diary.dog.name}</strong>
            {dog && (
              <span>
                {dog.breed} · {genderLabels[dog.gender]}
                {dog.neutered ? "(중성화)" : ""} · {dog.birthYear}년생
              </span>
            )}
            <span>{formatTitleDate(diary.walkedOn)}</span>
            <span className={styles.private}>
              <LockIcon />
              나만 보는 기록
            </span>
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/diaries" className={secondaryButton}>
            <ArrowLeft size={22} />
            일기 목록
          </Link>
          <Link href={`/diaries/${diary.id}/edit`} className={secondaryButton}>
            수정
          </Link>
          <button
            className={dangerButton}
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
      </div>
      {remove.error && <p role="alert">{remove.error.message}</p>}
      <div className={styles.detailBody}>
        {diary.images.length > 0 && (
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
        )}
        <p className={styles.content}>{diary.content}</p>
      </div>
    </>
  );
};

const DiaryPage = () => (
  <main
    className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.detailPage}`}
  >
    <Link href="/diaries" className={layoutStyles.back}>
      <ChevronLeft />
      산책 일기
    </Link>
    <AuthGate>
      <Suspense fallback={<p role="status">일기를 불러오고 있어요.</p>}>
        <DiaryDetail />
      </Suspense>
    </AuthGate>
  </main>
);
export default DiaryPage;
