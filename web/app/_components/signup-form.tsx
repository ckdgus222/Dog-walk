"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signup } from "../../lib/auth";
import styles from "./auth.module.css";
import formStyles from "./form.module.css";
import headingStyles from "./heading.module.css";
import { DogFields, readDogFields, Required } from "./dog-fields";
import { useAuthRequest } from "./use-auth-request";

export const SignupForm = ({
  onSuccess,
  onPendingChange,
  modal = false,
}: {
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  modal?: boolean;
}) => {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const startRequest = useAuthRequest();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const request = startRequest();
    const form = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    onPendingChange?.(true);
    try {
      await signup({
        email: form.get("email"),
        password: form.get("password"),
        nickname: form.get("nickname"),
        dog: readDogFields(form),
      });
      if (!request.left) onSuccess();
    } catch (error) {
      if (request.left) return;
      setError(error instanceof Error ? error.message : "가입하지 못했습니다.");
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  };

  return (
    <>
      <div className={styles.intro}>
        <p className={headingStyles.eyebrow}>함께 걷는, 더 특별한 하루</p>
        <h1
          className={`${headingStyles.title} ${modal ? headingStyles.formTitle : ""}`}
        >
          회원가입
        </h1>
        <p
          className={`${headingStyles.lead} ${modal ? headingStyles.modalLead : ""}`}
        >
          근처의 반려인과 산책하고,
          <br />
          소중한 일상을 함께 나눠보세요.
        </p>
      </div>
      <div>
        <form
          className={`${formStyles.form} ${styles.signupForm} ${modal ? styles.modalForm : ""}`}
          onSubmit={handleSubmit}
        >
          <fieldset
            className={`${formStyles.card} ${formStyles.rows} ${formStyles.signupFields}`}
            disabled={pending}
          >
            <legend>계정 정보</legend>
            <label>
              <span>
                이메일
                <Required />
              </span>
              <input
                name="email"
                type="email"
                maxLength={254}
                autoComplete="username"
                placeholder="이메일을 입력해주세요"
                required
              />
            </label>
            <label>
              <span>
                비밀번호
                <span className={formStyles.visuallyHidden}> (8~20자)</span>
                <Required />
              </span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="8~20자의 비밀번호를 입력해주세요"
                required
              />
            </label>
            <label>
              <span>
                닉네임
                <Required />
              </span>
              <input
                name="nickname"
                placeholder="2~20자의 닉네임을 입력해주세요"
                required
              />
            </label>
          </fieldset>
          <fieldset
            className={`${formStyles.card} ${formStyles.rows} ${formStyles.signupFields}`}
            disabled={pending}
          >
            <legend>반려견 정보</legend>
            <DogFields variant="signup" />
          </fieldset>
          <button className={formStyles.submit} disabled={pending}>
            {pending ? "가입 중…" : "가입하기"}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
        <p className={`${styles.links} ${styles.signupLinks}`}>
          이미 계정이 있으신가요?
          <Link href="/login" replace={modal}>
            로그인
          </Link>
          <Link href="/">홈으로</Link>
        </p>
      </div>
    </>
  );
};
