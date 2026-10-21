"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import styles from "./page.module.css";

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setError("");
    setPending(true);
    try {
      await logout();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "로그아웃하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1>강아지 산책</h1>
      {loading ? (
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : user ? (
        <>
          <p>{user.nickname}님, 안녕하세요</p>
          <button type="button" disabled={pending} onClick={handleLogout}>
            로그아웃
          </button>
        </>
      ) : (
        <nav aria-label="계정">
          <Link href="/login">로그인</Link>
          <Link href="/signup">회원가입</Link>
        </nav>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
