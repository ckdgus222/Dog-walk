"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signup } from "../../lib/auth";
import { DogFields, readDogFields } from "../_components/dog-fields";
import styles from "../_components/shared.module.css";

const SignupPage = () => {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      await signup({
        email: form.get("email"),
        password: form.get("password"),
        nickname: form.get("nickname"),
        dog: readDogFields(form),
      });
      router.push("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "가입하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className={`${styles.main} ${styles.narrow}`}>
      <h1>회원가입</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <fieldset disabled={pending}>
          <legend>계정 정보</legend>
          <label>
            이메일
            <input
              name="email"
              type="email"
              maxLength={254}
              autoComplete="username"
              required
            />
          </label>
          <label>
            비밀번호 (8~20자)
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            닉네임
            <input name="nickname" required />
          </label>
        </fieldset>
        <fieldset disabled={pending}>
          <legend>내 반려견</legend>
          <DogFields />
        </fieldset>
        <button disabled={pending}>{pending ? "가입 중…" : "가입하기"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <Link href="/login">로그인</Link>
      <Link href="/">홈으로</Link>
    </main>
  );
};
export default SignupPage;
