"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthGate } from "../../../_components/auth-gate";
import { apiFetch, responseError } from "../../../../lib/auth";
import DogForm from "../../dog-form";
import type { Dog } from "../../../../lib/types";
import styles from "../../../_components/shared.module.css";

const EditDog = () => {
  const { id } = useParams<{ id: string }>();
  const [dog, setDog] = useState<Dog | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadDog = async () => {
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
    };
    void loadDog();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p role="alert">{error}</p>;
  if (dog && String(dog.id) === id) return <DogForm key={dog.id} dog={dog} />;
  return <p role="status">반려견을 불러오고 있어요.</p>;
};

const EditDogPage = () => {
  return (
    <main className={styles.main}>
      <h1>반려견 수정</h1>
      <AuthGate>
        <Suspense fallback={<p role="status">반려견을 불러오고 있어요.</p>}>
          <EditDog />
        </Suspense>
      </AuthGate>
      <Link href="/dogs">내 반려견</Link>
    </main>
  );
};
export default EditDogPage;
