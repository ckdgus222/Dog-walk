"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSaveDog } from "../../lib/api/dogs";
import type { Dog } from "../../lib/types";
import { DogBody } from "../_components/dog-card";
import { DogFields, readDogFields } from "../_components/dog-fields";
import formStyles from "../_components/form.module.css";
import { PictureIcon } from "../_components/icons";
import styles from "./dogs.module.css";

const tooBig = (file?: File) => (file?.size ?? 0) > 5 * 1024 * 1024;
const tooBigMessage = "사진은 5MB 이하로 골라 주세요.";

const DogForm = ({ dog, order }: { dog?: Dog; order?: number }) => {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const save = useSaveDog(dog?.id);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError("");
    save.reset();
    const photo = fields.get("photo");
    if (photo instanceof File && tooBig(photo)) {
      setError(tooBigMessage);
      return;
    }
    const body = new FormData();
    body.set("dog", JSON.stringify(readDogFields(fields)));
    if (photo instanceof File && photo.name) body.set("photo", photo);
    save.mutate(body, { onSuccess: () => router.push("/dogs") });
  };

  // The real file input stays in the page, hidden behind its drawn button,
  // so keyboard focus and screen readers still reach it by its label.
  const photoInput = (
    <input
      className={formStyles.visuallyHidden}
      name="photo"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      aria-label="사진 (선택, 5MB 이하)"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        setFileName(file?.name ?? "");
        setError(tooBig(file) ? tooBigMessage : "");
      }}
    />
  );

  return (
    <form
      className={`${formStyles.form} ${dog ? styles.editForm : styles.addForm}`}
      onSubmit={handleSubmit}
    >
      <fieldset
        className={`${formStyles.card} ${dog ? formStyles.editFields : formStyles.addFields}`}
        disabled={save.isPending}
      >
        <legend className={formStyles.visuallyHidden}>반려견 정보</legend>
        <DogFields dog={dog} variant={dog ? "edit" : "add"} />
      </fieldset>
      <fieldset
        className={`${formStyles.card} ${styles.photoCard}`}
        disabled={save.isPending}
      >
        {dog ? (
          <>
            <legend className={formStyles.visuallyHidden}>사진</legend>
            {dog.photoUrl ? (
              // The web container cannot fetch nginx uploads for next/image optimization.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.currentPhoto}
                src={dog.photoUrl}
                alt={`${dog.name} 현재 사진`}
              />
            ) : (
              <DogBody
                dog={dog}
                className={styles.currentPhoto}
                order={order}
              />
            )}
            <label className={styles.photoButton}>
              {photoInput}새 사진 선택
            </label>
            <p className={styles.photoHint}>
              {fileName || "JPG, PNG, WebP 파일 (최대 5MB, 1장만 가능)"}
            </p>
          </>
        ) : (
          <>
            <legend>
              사진 <span className={formStyles.optional}>(선택사항)</span>
            </legend>
            <label className={styles.photoBox}>
              {photoInput}
              <PictureIcon />
              <strong>사진 선택</strong>
              <span>{fileName || "JPG · PNG · WebP, 5MB 이하"}</span>
            </label>
          </>
        )}
      </fieldset>
      <div className={styles.formActions}>
        <button className={formStyles.submit} disabled={save.isPending}>
          {save.isPending ? "저장 중…" : "저장하기"}
        </button>
        {!dog && (
          <Link
            href="/dogs"
            className={`${formStyles.secondary} ${styles.secondaryButton}`}
          >
            내 반려견으로 돌아가기
          </Link>
        )}
      </div>
      {(error || save.error) && (
        <p role="alert">{error || save.error?.message}</p>
      )}
    </form>
  );
};
export default DogForm;
