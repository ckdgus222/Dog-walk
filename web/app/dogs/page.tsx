"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "../_components/auth-gate";
import { DogCard } from "../_components/dog-card";
import { apiFetch, responseError } from "../../lib/auth";
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
  const [dogs, setDogs] = useState<Dog[] | null>(null);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadDogs = async () => {
      try {
        const response = await apiFetch("/api/dogs/me");
        if (!response.ok) throw await responseError(response);
        const result: Dog[] = await response.json();
        if (!cancelled) setDogs(result);
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error ? error.message : "불러오지 못했습니다.",
          );
      }
    };
    void loadDogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const removeDog = async (dog: Dog) => {
    if (!window.confirm(`${dog.name}의 정보를 삭제할까요?`)) return;
    setDeletingId(dog.id);
    setError("");
    try {
      const response = await apiFetch(`/api/dogs/${dog.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw await responseError(response);
      setDogs(
        (previous) => previous?.filter(({ id }) => id !== dog.id) ?? null,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Link href="/dogs/new">반려견 추가</Link>
      {error && <p role="alert">{error}</p>}
      {!dogs && !error && <p role="status">반려견을 불러오고 있어요.</p>}
      <div className={styles.cards}>
        {dogs?.map((dog) => (
          <DogCard key={dog.id} dog={dog} heading="h2">
            <div className={styles.actions}>
              <Link href={`/dogs/${dog.id}/edit`}>수정</Link>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => void removeDog(dog)}
              >
                {deletingId === dog.id ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </DogCard>
        ))}
      </div>
    </>
  );
};
