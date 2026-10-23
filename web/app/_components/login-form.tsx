"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ArrowRight } from "./icons";
import styles from "./auth.module.css";
import formStyles from "./form.module.css";
import headingStyles from "./heading.module.css";
import { useAuthRequest } from "./use-auth-request";

// "page" is the full login page, "modal" the login modal and "card" the
// login card on the guest home, which has its own title beside it.
export const LoginForm = ({
  onSuccess,
  onPendingChange,
  variant = "page",
}: {
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  variant?: "page" | "modal" | "card";
}) => {
  const page = variant === "page";
  const modal = variant === "modal";
  const card = variant === "card";
  const Title = card ? "h2" : "h1";
  const { login, loading } = useAuth();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const startRequest = useAuthRequest();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || loading) return;
    const request = startRequest();
    const form = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    onPendingChange?.(true);
    try {
      const canNavigate = await login(
        String(form.get("email")),
        String(form.get("password")),
        () => !request.left,
      );
      if (canNavigate) onSuccess();
    } catch (error) {
      if (request.left) return;
      setError(
        error instanceof Error ? error.message : "로그인하지 못했습니다.",
      );
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  };

  return (
    <>
      <Title
        className={`${headingStyles.title} ${page ? "" : headingStyles.formTitle}`}
      >
        로그인
      </Title>
      {!card && (
        <p
          className={`${headingStyles.lead} ${modal ? headingStyles.modalLead : ""}`}
        >
          좋은 산책은 좋은 이웃에서 시작돼요.
          <br />
          강아지 산책에서 가까운 산책 친구를 만나보세요.
        </p>
      )}
      <form
        className={`${formStyles.form} ${styles.loginForm} ${page ? "" : styles.modalForm}`}
        onSubmit={handleSubmit}
      >
        <label>
          이메일
          <span className={formStyles.control}>
            <input name="email" type="email" autoComplete="username" required />
          </span>
        </label>
        <label>
          비밀번호
          <span className={formStyles.control}>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </span>
        </label>
        <button className={formStyles.submit} disabled={pending || loading}>
          {pending ? "로그인 중…" : "로그인"}
          <ArrowRight size={24} />
        </button>
        {loading && <p role="status">로그인 상태를 확인하고 있어요.</p>}
        {error && <p role="alert">{error}</p>}
      </form>
      {card ? (
        <p className={styles.cardLinks}>
          처음이세요?
          <Link href="/signup">회원가입</Link>
        </p>
      ) : (
        <p className={styles.links}>
          <Link href="/signup" replace={modal}>
            회원가입
          </Link>
          <Link href="/">홈으로</Link>
        </p>
      )}
    </>
  );
};
