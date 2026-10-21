"use client";

import Link from "next/link";
import { AuthGate } from "../_components/auth-gate";
import { DogCard } from "../_components/dog-card";
import { useDeleteDog, useMyDogs } from "../../lib/api/dogs";
import type { Dog } from "../../lib/types";
import styles from "../_components/shared.module.css";

const DogsPage = () => {
  return (
    <main className={styles.main}>
      <h1>내 반려견</h1>
      <AuthGate>
        <DogList />
      </AuthGate>
      <Link href="/">홈으로</Link>
    </main>
  );
};
export default DogsPage;

const DogList = () => {
  const query = useMyDogs();
  const remove = useDeleteDog();
  const error = remove.error?.message ?? query.error?.message;

  const removeDog = (dog: Dog) => {
    if (!window.confirm(`${dog.name}의 정보를 삭제할까요?`)) return;
    remove.mutate(dog.id);
  };

  return (
    <>
      <Link href="/dogs/new">반려견 추가</Link>
      {error && <p role="alert">{error}</p>}
      {query.isPending && !error && (
        <p role="status">반려견을 불러오고 있어요.</p>
      )}
      <div className={styles.cards}>
        {query.data?.map((dog) => (
          <DogCard key={dog.id} dog={dog} heading="h2">
            <div className={styles.actions}>
              <Link href={`/dogs/${dog.id}/edit`}>수정</Link>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => removeDog(dog)}
              >
                {remove.isPending && remove.variables === dog.id
                  ? "삭제 중…"
                  : "삭제"}
              </button>
            </div>
          </DogCard>
        ))}
      </div>
    </>
  );
};
