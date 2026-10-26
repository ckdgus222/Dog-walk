"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../_components/auth-gate";
import { DogFace } from "../_components/dog-card";
import { EmptyState } from "../_components/empty-state";
import headingStyles from "../_components/heading.module.css";
import { ArrowRight } from "../_components/icons";
import formStyles from "../_components/form.module.css";
import layoutStyles from "../_components/layout.module.css";
import { Pager } from "../_components/pager";
import uiStyles from "../_components/ui.module.css";
import { useMyDogs } from "../../lib/api/dogs";
import { DIARY_PAGE_SIZE, useDiaries } from "../../lib/api/diaries";
import { DiaryImage } from "./diary-image";
import { formatListDate } from "./diary-date";
import diaryBook from "../../public/illustrations/walking-drawing/diary-book.svg";
import styles from "./diaries.module.css";

// The list's page and dog filter live in the address, so a page can be
// linked and the back button returns to it.
const listHref = (page: number, dogId?: number) => {
  const query = new URLSearchParams({ page: String(page) });
  if (dogId !== undefined) query.set("dogId", String(dogId));
  return `/diaries?${query}`;
};

const DiaryList = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const dogId = searchParams.has("dogId")
    ? Number(searchParams.get("dogId"))
    : undefined;
  const dogs = useMyDogs();
  const query = useDiaries(dogId, page);

  return (
    <>
      <div role="group" aria-label="반려견 고르기" className={styles.filters}>
        <button
          type="button"
          className={uiStyles.chip}
          aria-pressed={dogId === undefined}
          onClick={() => router.push(listHref(1))}
        >
          전체
        </button>
        {dogs.data?.map((dog) => (
          <button
            key={dog.id}
            type="button"
            className={uiStyles.chip}
            aria-pressed={dogId === dog.id}
            onClick={() => router.push(listHref(1, dog.id))}
          >
            {dog.name}
          </button>
        ))}
      </div>
      {dogs.error && <p role="alert">{dogs.error.message}</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">일기를 불러오고 있어요.</p>}
      {query.isSuccess && page === 1 && query.data.diaries.length === 0 && (
        <EmptyState
          image={diaryBook}
          title="아직 일기가 없어요."
          description="오늘 산책은 어땠나요? 첫 기록을 남겨 보세요."
          action={{ href: "/diaries/new", label: "첫 일기 쓰기" }}
        />
      )}
      {!!query.data?.diaries.length && (
        <div className={styles.list}>
          {query.data.diaries.map((diary) => {
            const order =
              dogs.data?.findIndex((dog) => dog.id === diary.dog.id) ?? -1;
            const dog = dogs.data?.[order];
            return (
              <article key={diary.id} className={styles.entry}>
                <Link href={`/diaries/${diary.id}`}>
                  <div className={styles.entryText}>
                    <p className={styles.entryMeta}>
                      {dog && (
                        <DogFace
                          dog={dog}
                          className={uiStyles.face}
                          size={24}
                          order={order}
                        />
                      )}
                      <span className={styles.entryDog}>{diary.dog.name}</span>
                      <span aria-hidden="true">·</span>
                      {formatListDate(diary.walkedOn)}
                    </p>
                    <h2 className={styles.entryTitle}>{diary.title}</h2>
                    {/* CSS clamps it to two lines; the slice keeps a long
                        diary from filling the page with hidden text. */}
                    <p className={styles.excerpt}>
                      {diary.content.slice(0, 200)}
                    </p>
                  </div>
                  {diary.images.length > 0 ? (
                    // The first two photos, with the count of all of them.
                    <div className={styles.entryPhotos}>
                      {diary.images.slice(0, 2).map((image, index) => (
                        <DiaryImage
                          key={image.id}
                          diaryId={diary.id}
                          imageId={image.id}
                          alt={`${diary.dog.name} 일기 사진 ${index + 1}`}
                          className={styles.entryPhoto}
                        />
                      ))}
                      <p className={styles.photoCount}>
                        <span className={formStyles.visuallyHidden}>사진 </span>
                        {diary.images.length}장
                      </p>
                    </div>
                  ) : (
                    <p className={uiStyles.meta}>사진 0장</p>
                  )}
                </Link>
              </article>
            );
          })}
          {/* A short last page offers the next diary in the space left. */}
          {query.data.diaries.length < DIARY_PAGE_SIZE && (
            <Link href="/diaries/new" className={styles.writeTile}>
              <Image src={diaryBook} alt="" width={48} height={48} />
              <strong>오늘 산책도 기록해 볼까요?</strong>
              <span>새 일기 남기기</span>
            </Link>
          )}
        </div>
      )}
      {query.data && (
        <Pager
          label="산책 일기 페이지"
          page={page}
          totalPages={query.data.totalPages}
          href={(to) => listHref(to, dogId)}
          emptyText="이 페이지에는 일기가 없어요."
        />
      )}
    </>
  );
};

const DiariesPage = () => (
  <main
    className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.listPage}`}
  >
    <div className={layoutStyles.head}>
      <div>
        <h1 className={headingStyles.title}>산책 일기</h1>
        <p className={headingStyles.lead}>나만 보는 기록</p>
      </div>
      <Link href="/diaries/new" className={layoutStyles.headAction}>
        일기 쓰기
        <ArrowRight />
      </Link>
    </div>
    <AuthGate>
      <Suspense fallback={<p role="status">일기를 불러오고 있어요.</p>}>
        <DiaryList />
      </Suspense>
    </AuthGate>
  </main>
);
export default DiariesPage;
