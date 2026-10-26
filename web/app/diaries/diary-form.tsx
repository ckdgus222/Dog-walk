"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMyDogs } from "../../lib/api/dogs";
import { useSaveDiary } from "../../lib/api/diaries";
import type { Diary } from "../../lib/types";
import Link from "next/link";
import { DiaryImage } from "./diary-image";
import { DogFace } from "../_components/dog-card";
import formStyles from "../_components/form.module.css";
import { CameraIcon, CloseIcon } from "../_components/icons";
import { BlobImage } from "../_components/blob-image";
import styles from "./diaries.module.css";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const DiaryForm = ({ diary }: { diary?: Diary }) => {
  const router = useRouter();
  const myDogs = useMyDogs();
  const saveDiary = useSaveDiary(diary?.id);
  const [error, setError] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [removeImageIds, setRemoveImageIds] = useState<number[]>([]);
  const [dogId, setDogId] = useState(diary?.dog.id);
  const [length, setLength] = useState(diary?.content.length ?? 0);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const kept = (diary?.images.length ?? 0) - removeImageIds.length;
  const photoError = images.some((image) => image.size > MAX_PHOTO_BYTES)
    ? "사진은 5MB 이하로 골라 주세요."
    : kept + images.length > 5
      ? "사진은 일기 하나에 5장까지예요."
      : "";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    saveDiary.reset();
    if (photoError) return;
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title") ?? "").trim();
    if (!title) {
      setError("제목을 입력해 주세요.");
      return;
    }
    const content = String(fields.get("content") ?? "").trim();
    if (!content) {
      setError("글을 입력해 주세요.");
      return;
    }
    const body = new FormData();
    body.set(
      "diary",
      JSON.stringify({
        dogId: Number(fields.get("dogId")),
        walkedOn: fields.get("walkedOn"),
        title,
        content,
        ...(diary ? { removeImageIds } : {}),
      }),
    );
    images.forEach((image) => body.append("images", image));
    saveDiary.mutate(body, {
      onSuccess: (saved) => router.push(`/diaries/${saved.id}`),
    });
  };

  if (myDogs.error) return <p role="alert">{myDogs.error.message}</p>;
  if (!myDogs.data) return <p role="status">반려견을 불러오고 있어요.</p>;

  const order = myDogs.data.findIndex((dog) => dog.id === dogId);
  // The real file input stays in the page behind its drawn box. Its name,
  // "사진 (최대 5장, 장당 5MB 이하)", is how screen readers and tests find it.
  const photoInput = (
    <input
      className={formStyles.visuallyHidden}
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp"
      aria-label="사진 (최대 5장, 장당 5MB 이하)"
      onChange={(event) => {
        setImages(Array.from(event.currentTarget.files ?? []));
        // Picking the same files again after removing one still counts.
        event.currentTarget.value = "";
      }}
    />
  );
  const actions = (
    <div className={styles.formActions}>
      <Link href="/diaries" className={formStyles.secondary}>
        일기 목록
      </Link>
      <button className={formStyles.submit} disabled={saveDiary.isPending}>
        {saveDiary.isPending ? "저장 중…" : "저장하기"}
      </button>
    </div>
  );

  return (
    <form
      className={`${formStyles.form} ${diary ? `${formStyles.card} ${styles.editForm}` : styles.newForm}`}
      onSubmit={handleSubmit}
    >
      <fieldset className={styles.fields} disabled={saveDiary.isPending}>
        <legend className={formStyles.visuallyHidden}>반려견 일기</legend>
        <div className={styles.topRow}>
          <label>
            반려견
            <span className={`${formStyles.control} ${styles.picker}`}>
              {order >= 0 && (
                <DogFace
                  dog={myDogs.data[order]}
                  className={styles.pickerFace}
                  size={32}
                  order={order}
                />
              )}
              <select
                name="dogId"
                required
                value={dogId ?? ""}
                onChange={(event) => setDogId(Number(event.target.value))}
              >
                <option value="" disabled>
                  골라 주세요
                </option>
                {myDogs.data.map((dog) => (
                  <option key={dog.id} value={dog.id}>
                    {dog.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label>
            산책한 날짜
            <span className={formStyles.control}>
              <input
                name="walkedOn"
                type="date"
                required
                defaultValue={diary?.walkedOn ?? today}
                max={today}
              />
            </span>
          </label>
          <label className={styles.titleField}>
            제목
            <span className={formStyles.control}>
              <input
                name="title"
                required
                maxLength={50}
                defaultValue={diary?.title ?? ""}
              />
            </span>
          </label>
        </div>
        <label className={styles.bodyField}>
          {diary ? "일기 내용" : "글"}
          <span className={`${formStyles.control} ${formStyles.counted}`}>
            <textarea
              name="content"
              required
              maxLength={2000}
              defaultValue={diary?.content ?? ""}
              placeholder="오늘의 산책 이야기를 자유롭게 적어보세요."
              onChange={(event) => setLength(event.currentTarget.value.length)}
            />
            <span
              className={formStyles.count}
              aria-hidden="true"
              data-count={`${length} / 2000`}
            />
          </span>
        </label>
        {/* One row of photo boxes: the diary's photos (edit), the new
            picks and the box to pick more. Picking again replaces the new
            picks, as the file input does. */}
        <div className={styles.photoField}>
          <div className={styles.photoHead}>
            <p className={styles.photoLabel}>
              사진 <span className={formStyles.optional}>(선택 사항)</span>
            </p>
            <p>
              최대 5장 · 장당 5MB까지 · 지금 {kept + images.length}장
            </p>
          </div>
          <div className={styles.slots}>
            {diary?.images.map((image, index) => {
              const removing = removeImageIds.includes(image.id);
              return (
              <div
                key={image.id}
                className={`${styles.slot} ${removing ? styles.removing : ""}`}
              >
                <DiaryImage
                  diaryId={diary.id}
                  imageId={image.id}
                  alt={`기존 일기 사진 ${index + 1}`}
                  className={styles.slotPhoto}
                />
                <label className={`${formStyles.checkbox} ${styles.slotCheck}`}>
                  <input
                    type="checkbox"
                    checked={removing}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setRemoveImageIds((ids) =>
                        checked
                          ? [...ids, image.id]
                          : ids.filter((id) => id !== image.id),
                      );
                    }}
                  />
                  {/* The box shows "지우기"; the full name stays "이 사진 지우기". */}
                  <span className={formStyles.visuallyHidden}>이 사진 </span>
                  지우기
                </label>
              </div>
              );
            })}
            {images.map((file, index) => {
              const tooBig = file.size > MAX_PHOTO_BYTES;
              return (
              <div
                key={index}
                className={`${styles.slot} ${tooBig ? styles.tooBig : ""}`}
              >
                <BlobImage
                  blob={file}
                  alt={`새 사진 ${index + 1} 미리보기`}
                  className={styles.slotPhoto}
                />
                {tooBig && <span className={styles.slotNote}>5MB 초과</span>}
                <button
                  type="button"
                  className={styles.slotRemove}
                  aria-label={`새 사진 ${index + 1} 빼기`}
                  onClick={() =>
                    setImages((files) => files.filter((_, at) => at !== index))
                  }
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              );
            })}
            <label className={styles.addSlot}>
              {photoInput}
              <CameraIcon size={32} />
              <strong>{images.length > 0 ? "다시 고르기" : "사진 추가"}</strong>
            </label>
          </div>
        </div>
      </fieldset>
      {actions}
      {(photoError || error || saveDiary.error) && (
        <p role="alert">{photoError || error || saveDiary.error?.message}</p>
      )}
    </form>
  );
};
export default DiaryForm;
