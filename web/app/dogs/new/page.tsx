"use client";

import Link from "next/link";
import { useAuth } from "../../auth-provider";
import DogForm from "../dog-form";
import styles from "../dogs.module.css";

export default function NewDogPage() {
  const { user, loading } = useAuth();
  return (
    <main className={styles.main}>
      <h1>반려견 추가</h1>
      {loading ? (
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : !user ? (
        <Link href="/login">로그인</Link>
      ) : (
        <DogForm />
      )}
      <Link href="/dogs">내 반려견</Link>
    </main>
  );
}
