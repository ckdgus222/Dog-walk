"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "../../../auth-provider";
import { apiFetch, responseError } from "../../../../lib/auth";
import DogForm, { type Dog } from "../../dog-form";
import styles from "../../dogs.module.css";

function EditDog() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [dog, setDog] = useState<Dog | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadDog() {
      try {
        const response = await apiFetch("/api/dogs/me");
        if (!response.ok) throw await responseError(response);
        const dogs: Dog[] = await response.json();
        const found = dogs.find((dog) => String(dog.id) === id);
        if (!found) throw new Error("반려견을 찾을 수 없어요.");
        if (!cancelled) {
          setDog(found);
          setError("");
        }
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error ? error.message : "불러오지 못했습니다.",
          );
      }
    }
    void loadDog();
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  return (
    <main className={styles.main}>
      <h1>반려견 수정</h1>
      {loading ? (
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : !user ? (
        <Link href="/login">로그인</Link>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : dog && String(dog.id) === id ? (
        <DogForm key={dog.id} dog={dog} />
      ) : (
        <p role="status">반려견을 불러오고 있어요.</p>
      )}
      <Link href="/dogs">내 반려견</Link>
    </main>
  );
}

export default function EditDogPage() {
  return (
    <Suspense fallback={<p role="status">반려견을 불러오고 있어요.</p>}>
      <EditDog />
    </Suspense>
  );
}
