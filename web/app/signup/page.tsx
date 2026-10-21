"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { responseError } from "../../lib/auth";
import styles from "../auth.module.css";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          nickname: form.get("nickname"),
          dog: {
            name: form.get("name"),
            breed: form.get("breed"),
            size: form.get("size"),
            gender: form.get("gender"),
            neutered: form.get("neutered") === "on",
            birthYear: Number(form.get("birthYear")),
            personality: form.get("personality"),
          },
        }),
      });
      if (!response.ok) throw await responseError(response);
      router.push("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "가입하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.main}>
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
          <label>
            이름
            <input name="name" required />
          </label>
          <label>
            견종
            <input name="breed" required />
          </label>
          <label>
            크기
            <select name="size" defaultValue="" required>
              <option value="" disabled>
                선택해 주세요
              </option>
              <option value="SMALL">소형</option>
              <option value="MEDIUM">중형</option>
              <option value="LARGE">대형</option>
            </select>
          </label>
          <label>
            성별
            <select name="gender" defaultValue="" required>
              <option value="" disabled>
                선택해 주세요
              </option>
              <option value="MALE">수컷</option>
              <option value="FEMALE">암컷</option>
            </select>
          </label>
          <label className={styles.checkbox}>
            <input name="neutered" type="checkbox" />
            중성화했어요
          </label>
          <label>
            태어난 해
            <input
              name="birthYear"
              type="number"
              min={1990}
              step={1}
              aria-describedby="birth-year-help"
              required
            />
          </label>
          <p id="birth-year-help">정확히 모르면 대략적인 해를 적어 주세요</p>
          <label>
            성격 소개
            <textarea name="personality" rows={3} required />
          </label>
        </fieldset>
        <button disabled={pending}>{pending ? "가입 중…" : "가입하기"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <Link href="/login">로그인</Link>
      <Link href="/">홈으로</Link>
    </main>
  );
}
