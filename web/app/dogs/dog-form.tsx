"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSaveDog } from "../../lib/api/dogs";
import type { Dog } from "../../lib/types";
import { BlobImage } from "../_components/blob-image";
import { secondaryButton } from "../_components/buttons";
import { DogBody } from "../_components/dog-card";
import { DogFields, readDogFields } from "../_components/dog-fields";
import formStyles from "../_components/form.module.css";
import { PictureIcon } from "../_components/icons";
import { useResetAfterSave } from "../_components/use-reset-after-save";
import crouchPet from "../../public/illustrations/walking-drawing/crouch-pet.png";
import styles from "./dogs.module.css";

const tooBig = (file?: File) => (file?.size ?? 0) > 5 * 1024 * 1024;
const tooBigMessage = "사진은 5MB 이하로 골라 주세요.";

const DogForm = ({ dog, order }: { dog?: Dog; order?: number }) => {
  const [key, markSaved] = useResetAfterSave();
  return (
    <DogFormBody key={key} dog={dog} order={order} onSaved={markSaved} />
  );
};

const DogFormBody = ({
  dog,
  order,
  onSaved,
}: {
  dog?: Dog;
  order?: number;
  onSaved: () => void;
}) => {
  const router = useRouter();
  const [error, setError] = useState("");
  // The picked photo, shown in place of the current one and sent on saving.
  const [file, setFile] = useState<File>();
  const saveDog = useSaveDog(dog?.id, onSaved);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError("");
    saveDog.reset();
    if (tooBig(file)) {
      setError(tooBigMessage);
      return;
    }
    const body = new FormData();
    body.set("dog", JSON.stringify(readDogFields(fields)));
    if (file) body.set("photo", file);
    saveDog.mutate(body, { onSuccess: () => router.push("/dogs") });
  };

  // The real file input stays in the page, hidden behind its drawn button,
  // so keyboard focus and screen readers still reach it by its label.
  const photoInput = (
    <input
      className={formStyles.visuallyHidden}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      aria-label="사진 (선택, 5MB 이하)"
      onChange={(event) => {
        const picked = event.currentTarget.files?.[0];
        setFile(picked);
        setError(tooBig(picked) ? tooBigMessage : "");
        // The state holds the photo, so picking the same file again after
        // cancelling still counts.
        event.currentTarget.value = "";
      }}
    />
  );
  const preview = file && (
    <BlobImage
      blob={file}
      alt="고른 사진 미리보기"
      className={dog ? styles.currentPhoto : styles.pickedPhoto}
    />
  );
  // Outside the label, so it does not open the file picker again.
  const cancel = file && (
    <button
      type="button"
      className={secondaryButton}
      onClick={() => {
        setFile(undefined);
        setError("");
      }}
    >
      선택 취소
    </button>
  );

  return (
    <form
      className={`${formStyles.form} ${dog ? styles.editForm : styles.addForm}`}
      onSubmit={handleSubmit}
    >
      <fieldset
        className={`${formStyles.card} ${formStyles.besideLabels} ${styles.fields} ${dog ? formStyles.editFields : formStyles.addFields}`}
        disabled={saveDog.isPending}
      >
        <legend className={formStyles.visuallyHidden}>반려견 정보</legend>
        <DogFields dog={dog} variant={dog ? "edit" : "add"} />
      </fieldset>
      <fieldset
        className={`${formStyles.card} ${styles.photoCard}`}
        disabled={saveDog.isPending}
      >
        {dog ? (
          <>
            <legend className={formStyles.visuallyHidden}>사진</legend>
            {preview ??
              (dog.photoUrl ? (
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
            ))}
            <label className={styles.photoButton}>
              {photoInput}새 사진 선택
            </label>
            <p className={styles.photoHint}>
              {file?.name ?? "JPG, PNG, WebP 파일 (최대 5MB, 1장만 가능)"}
            </p>
            {cancel}
          </>
        ) : (
          <>
            <legend>
              사진 <span className={formStyles.optional}>(선택사항)</span>
            </legend>
            <label className={styles.photoBox}>
              {photoInput}
              {preview ?? (
                <>
                  <PictureIcon />
                  <strong>사진 선택</strong>
                  <span>JPG · PNG · WebP, 5MB 이하</span>
                </>
              )}
            </label>
            {cancel}
          </>
        )}
      </fieldset>
      <div className={styles.formActions}>
        <button className={formStyles.submit} disabled={saveDog.isPending}>
          {saveDog.isPending ? "저장 중…" : "저장하기"}
        </button>
        {!dog && (
          <Link href="/dogs" className={formStyles.secondary}>
            목록으로
          </Link>
        )}
      </div>
      {/* The walker crouches under the buttons in the add form's side
          column. */}
      {!dog && (
        <Image
          className={styles.crouchPet}
          src={crouchPet}
          alt=""
          sizes="320px"
        />
      )}
      {(error || saveDog.error) && (
        <p role="alert">{error || saveDog.error?.message}</p>
      )}
    </form>
  );
};
export default DogForm;
