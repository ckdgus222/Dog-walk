"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { ArrowRight, InfoIcon } from "./icons";
import styles from "./auth.module.css";
import formStyles from "./form.module.css";
import headingStyles from "./heading.module.css";
import uiStyles from "./ui.module.css";
import { useAuthRequest } from "./use-auth-request";

// "page" is the full login page, "modal" the login modal, "card" the login
// card on the guest home, which has its own title beside it, and "menu" the
// login window a guest gets from a locked menu item.
export const LoginForm = ({
  onSuccess,
  onPendingChange,
  onSignupClick,
  variant = "page",
}: {
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  onSignupClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  variant?: "page" | "modal" | "card" | "menu";
}) => {
  const page = variant === "page";
  const modal = variant === "modal";
  const card = variant === "card";
  const menu = variant === "menu";
  const Title = card ? "h2" : "h1";
  const { login, loginDemo, loading } = useAuth();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const startRequest = useAuthRequest();

  const submitLogin = async (
    authenticate: (canNavigate: () => boolean) => Promise<boolean>,
  ) => {
    if (pending || loading) return;
    const request = startRequest();
    setError("");
    setPending(true);
    onPendingChange?.(true);
    try {
      const canNavigate = await authenticate(() => !request.left);
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submitLogin((canNavigate) =>
      login(String(form.get("email")), String(form.get("password")), canNavigate),
    );
  };

  return (
    <>
      <Title className={headingStyles.title}>로그인</Title>
      {menu && (
        <p role="alert" className={uiStyles.warning}>
          <InfoIcon />
          로그인 후 이용할 수 있어요.
        </p>
      )}
      {(page || modal) && (
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
        <button
          type="button"
          className={uiStyles.button}
          disabled={pending || loading}
          onClick={() => void submitLogin(loginDemo)}
        >
          가입 없이 둘러보기
        </button>
        {loading && <p role="status">로그인 상태를 확인하고 있어요.</p>}
        {error && <p role="alert">{error}</p>}
      </form>
      {card || menu ? (
        <p className={styles.cardLinks}>
          처음이세요?
          <Link href="/signup" onClick={onSignupClick}>
            회원가입
          </Link>
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
