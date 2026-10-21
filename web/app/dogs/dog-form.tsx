"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, responseError } from "../../lib/auth";
import styles from "./dogs.module.css";

export interface Dog {
  id: number;
  name: string;
  breed: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  gender: "MALE" | "FEMALE";
  neutered: boolean;
  birthYear: number;
  personality: string;
  photoUrl: string | null;
  createdAt: string;
}

const DogForm = ({ dog }: { dog?: Dog }) => {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError("");
    const photo = fields.get("photo");
    if (photo instanceof File && photo.size > 5 * 1024 * 1024) {
      setError("사진은 5MB 이하로 골라 주세요.");
      return;
    }
    const body = new FormData();
    body.set(
      "dog",
      JSON.stringify({
        name: fields.get("name"),
        breed: fields.get("breed"),
        size: fields.get("size"),
        gender: fields.get("gender"),
        neutered: fields.get("neutered") === "on",
        birthYear: Number(fields.get("birthYear")),
        personality: fields.get("personality"),
      }),
    );
    if (photo instanceof File && photo.name) body.set("photo", photo);
    setPending(true);
    try {
      const response = await apiFetch(
        dog ? `/api/dogs/${dog.id}` : "/api/dogs",
        {
          method: dog ? "PATCH" : "POST",
          body,
        },
      );
      if (!response.ok) throw await responseError(response);
      router.push("/dogs");
    } catch (error) {
      setError(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <fieldset disabled={pending}>
        <legend>내 반려견</legend>
        <label>
          이름
          <input name="name" defaultValue={dog?.name} required />
        </label>
        <label>
          견종
          <input name="breed" defaultValue={dog?.breed} required />
        </label>
        <label>
          크기
          <select name="size" defaultValue={dog?.size ?? ""} required>
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
          <select name="gender" defaultValue={dog?.gender ?? ""} required>
            <option value="" disabled>
              선택해 주세요
            </option>
            <option value="MALE">수컷</option>
            <option value="FEMALE">암컷</option>
          </select>
        </label>
        <label className={styles.checkbox}>
          <input
            name="neutered"
            type="checkbox"
            defaultChecked={dog?.neutered}
          />
          중성화했어요
        </label>
        <label>
          태어난 해
          <input
            name="birthYear"
            type="number"
            min={1990}
            step={1}
            defaultValue={dog?.birthYear}
            aria-describedby="birth-year-help"
            required
          />
        </label>
        <p id="birth-year-help">정확히 모르면 대략적인 해를 적어 주세요</p>
        <label>
          성격 소개
          <textarea
            name="personality"
            rows={3}
            defaultValue={dog?.personality}
            required
          />
        </label>
        {dog?.photoUrl && (
          // The web container cannot fetch nginx uploads for next/image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.photo}
            src={dog.photoUrl}
            alt={`${dog.name} 현재 사진`}
          />
        )}
        <label>
          사진 (선택, 5MB 이하)
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              setError(
                (event.currentTarget.files?.[0]?.size ?? 0) > 5 * 1024 * 1024
                  ? "사진은 5MB 이하로 골라 주세요."
                  : "",
              )
            }
          />
        </label>
      </fieldset>
      <button disabled={pending}>{pending ? "저장 중…" : "저장하기"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
};
export default DogForm;
