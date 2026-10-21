"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, responseError } from "../../lib/auth";
import type { Dog } from "../../lib/types";
import { DogFields, readDogFields } from "../_components/dog-fields";
import styles from "../_components/shared.module.css";

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
    body.set("dog", JSON.stringify(readDogFields(fields)));
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
        <DogFields dog={dog} />
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
