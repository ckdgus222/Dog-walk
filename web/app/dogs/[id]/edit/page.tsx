"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../../_components/auth-gate";
import headingStyles from "../../../_components/heading.module.css";
import { useDogForEdit } from "../../../../lib/api/dogs";
import DogForm from "../../dog-form";
import styles from "../../dogs.module.css";

const EditDog = () => {
  const { id } = useParams<{ id: string }>();
  const query = useDogForEdit(id);

  // Build the form only from a read that finished after entering this page;
  // the form uses defaultValue, so a stale cached dog would never update.
  if (query.isFetching) return <p role="status">반려견을 불러오고 있어요.</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (query.isSuccess) return <DogForm key={query.data.id} dog={query.data} />;
  return <p role="status">반려견을 불러오고 있어요.</p>;
};

const EditDogPage = () => {
  return (
    <main className={styles.main}>
      <Link href="/dogs" className={styles.back}>
        <span aria-hidden="true">‹</span>내 반려견
      </Link>
      <div>
        <h1 className={headingStyles.title}>반려견 수정</h1>
        <p className={headingStyles.lead}>
          우리 아이의 정보를 고칠 수 있어요.
        </p>
      </div>
      <AuthGate>
        <Suspense fallback={<p role="status">반려견을 불러오고 있어요.</p>}>
          <EditDog />
        </Suspense>
      </AuthGate>
    </main>
  );
};
export default EditDogPage;
