"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSaveDog } from "../../lib/api/dogs";
import type { Dog } from "../../lib/types";
import { DogFields, readDogFields } from "../_components/dog-fields";
import styles from "../_components/shared.module.css";

const DogForm = ({ dog }: { dog?: Dog }) => {
  const router = useRouter();
  const [error, setError] = useState("");
  const save = useSaveDog(dog?.id);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError("");
    save.reset();
    const photo = fields.get("photo");
    if (photo instanceof File && photo.size > 5 * 1024 * 1024) {
      setError("사진은 5MB 이하로 골라 주세요.");
      return;
    }
    const body = new FormData();
    body.set("dog", JSON.stringify(readDogFields(fields)));
    if (photo instanceof File && photo.name) body.set("photo", photo);
    save.mutate(body, { onSuccess: () => router.push("/dogs") });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <fieldset disabled={save.isPending}>
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
      <button disabled={save.isPending}>
        {save.isPending ? "저장 중…" : "저장하기"}
      </button>
      {(error || save.error) && (
        <p role="alert">{error || save.error?.message}</p>
      )}
    </form>
  );
};
export default DogForm;
