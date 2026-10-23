"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "../_components/auth-provider";
import styles from "../_components/auth.module.css";
import { ScenePage } from "../_components/walk-scene";

const LoginPage = () => {
  const { login, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
  };

  return (
    <ScenePage className={styles.content}>
      <h1 className={styles.title}>로그인</h1>
      <p className={styles.lead}>
        좋은 산책은 좋은 이웃에서 시작돼요.
        <br />
        강아지 산책에서 가까운 산책 친구를 만나보세요.
      </p>
      <form
        className={`${styles.form} ${styles.loginForm}`}
        onSubmit={handleSubmit}
      >
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
        <button className={styles.submit} disabled={pending || loading}>
          {pending ? "로그인 중…" : "로그인"}
          <span aria-hidden="true">→</span>
        </button>
        {loading && <p role="status">로그인 상태를 확인하고 있어요.</p>}
        {error && <p role="alert">{error}</p>}
      </form>
      <p className={styles.links}>
        <Link href="/signup">회원가입</Link>
        <Link href="/">홈으로</Link>
      </p>
    </ScenePage>
  );
};
export default LoginPage;
