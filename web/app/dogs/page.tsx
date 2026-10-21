"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { apiFetch, responseError } from "../../lib/auth";
import type { Dog } from "./dog-form";
import styles from "./dogs.module.css";

const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" };

const DogsPage = () => {
  const { user, loading } = useAuth();
  const [dogs, setDogs] = useState<Dog[] | null>(null);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

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
    <main className={styles.main}>
      <h1>내 반려견</h1>
      {loading ? (
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : !user ? (
        <Link href="/login">로그인</Link>
      ) : (
        <>
          <Link href="/dogs/new">반려견 추가</Link>
          {error && <p role="alert">{error}</p>}
          {!dogs && !error && <p role="status">반려견을 불러오고 있어요.</p>}
          <div className={styles.cards}>
            {dogs?.map((dog) => (
              <article key={dog.id} className={styles.card}>
                {dog.photoUrl ? (
                  // The web container cannot fetch nginx uploads for next/image optimization.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.photo}
                    src={dog.photoUrl}
                    alt={`${dog.name} 사진`}
                  />
                ) : (
                  <p>사진 없음</p>
                )}
                <h2>{dog.name}</h2>
                <p>
                  {dog.breed} · {sizeLabels[dog.size]} ·{" "}
                  {dog.gender === "MALE" ? "수컷" : "암컷"}
                </p>
                <p>
                  {dog.neutered ? "중성화했어요" : "중성화하지 않았어요"} ·{" "}
                  {dog.birthYear}년생
                </p>
                <p>{dog.personality}</p>
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
              </article>
            ))}
          </div>
        </>
      )}
      <Link href="/">홈으로</Link>
    </main>
  );
};
export default DogsPage;
