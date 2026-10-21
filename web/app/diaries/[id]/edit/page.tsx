"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../../_components/auth-gate";
import { useDiary } from "../../../../lib/api/diaries";
import DiaryForm from "../../diary-form";
import styles from "../../../_components/shared.module.css";

const EditDiary = () => {
  const { id } = useParams<{ id: string }>();
  const query = useDiary(Number(id), true);

  // defaultValue must only use a successful read made after entering this page.
  if (query.isFetching) return <p role="status">일기를 불러오고 있어요.</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (query.isSuccess)
    return <DiaryForm key={query.data.id} diary={query.data} />;
  return <p role="status">일기를 불러오고 있어요.</p>;
};

const EditDiaryPage = () => (
  <main className={styles.main}>
    <h1>일기 수정</h1>
    <AuthGate>
      <Suspense fallback={<p role="status">일기를 불러오고 있어요.</p>}>
        <EditDiary />
      </Suspense>
    </AuthGate>
    <Link href="/diaries">일기 목록</Link>
  </main>
);
export default EditDiaryPage;
