"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../../_components/auth-gate";
import { ChevronLeft } from "../../../_components/icons";
import { useDiary } from "../../../../lib/api/diaries";
import DiaryForm from "../../diary-form";
import headingStyles from "../../../_components/heading.module.css";
import layoutStyles from "../../../_components/layout.module.css";
import styles from "../../diaries.module.css";

const EditDiary = () => {
  const { id } = useParams<{ id: string }>();
  const diary = useDiary(Number(id), true);

  // defaultValue must only use a successful read made after entering this page.
  if (diary.isFetching) return <p role="status">일기를 불러오고 있어요.</p>;
  if (diary.error) return <p role="alert">{diary.error.message}</p>;
  if (diary.isSuccess)
    return <DiaryForm key={diary.data.id} diary={diary.data} />;
  return <p role="status">일기를 불러오고 있어요.</p>;
};

const EditDiaryPage = () => (
  <main
    className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.editPage}`}
  >
    <Link href="/diaries" className={layoutStyles.back}>
      <ChevronLeft />
      산책 일기
    </Link>
    <div>
      <h1 className={headingStyles.title}>일기 수정</h1>
      <p className={headingStyles.lead}>
        산책의 순간을 기록하고, 소중한 추억을 간직해요.
      </p>
    </div>
    <AuthGate>
      <Suspense fallback={<p role="status">일기를 불러오고 있어요.</p>}>
        <EditDiary />
      </Suspense>
    </AuthGate>
  </main>
);
export default EditDiaryPage;
