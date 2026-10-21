"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth-provider";
import styles from "../auth.module.css";

export default function LoginPage() {
  const { login, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      await login(String(form.get("email")), String(form.get("password")));
      router.push("/");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "로그인하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1>로그인</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          이메일
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          비밀번호
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button disabled={pending || loading}>
          {pending ? "로그인 중…" : "로그인"}
        </button>
        {loading && <p role="status">로그인 상태를 확인하고 있어요.</p>}
        {error && <p role="alert">{error}</p>}
      </form>
      <Link href="/signup">회원가입</Link>
      <Link href="/">홈으로</Link>
    </main>
  );
}
