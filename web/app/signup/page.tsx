"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signup } from "../../lib/auth";
import styles from "../_components/auth.module.css";
import { DogFields, readDogFields } from "../_components/dog-fields";
import { ScenePage } from "../_components/walk-scene";

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
    <ScenePage className={`${styles.content} ${styles.signup}`}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>함께 걷는, 더 특별한 하루</p>
        <h1 className={styles.title}>회원가입</h1>
        <p className={styles.lead}>
          근처의 반려인과 산책하고,
          <br />
          소중한 일상을 함께 나눠보세요.
        </p>
      </div>
      <div>
        <form
          className={`${styles.form} ${styles.signupForm}`}
          onSubmit={handleSubmit}
        >
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
            <legend>반려견 정보</legend>
            <DogFields />
          </fieldset>
          <button className={styles.submit} disabled={pending}>
            {pending ? "가입 중…" : "가입하기"}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
        <p className={`${styles.links} ${styles.signupLinks}`}>
          이미 계정이 있으신가요?
          <Link href="/login">로그인</Link>
          <Link href="/">홈으로</Link>
        </p>
      </div>
    </ScenePage>
  );
};
export default SignupPage;
