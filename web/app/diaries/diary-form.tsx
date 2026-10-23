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
import { CameraIcon, ChevronDown, PictureIcon } from "../_components/icons";
import styles from "./diaries.module.css";

const DiaryForm = ({ diary }: { diary?: Diary }) => {
  const router = useRouter();
  const dogs = useMyDogs();
  const save = useSaveDiary(diary?.id);
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
  const photoError = images.some((image) => image.size > 5 * 1024 * 1024)
    ? "사진은 5MB 이하로 골라 주세요."
    : kept + images.length > 5
      ? "사진은 일기 하나에 5장까지예요."
      : "";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    save.reset();
    if (photoError) return;
    const fields = new FormData(event.currentTarget);
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
        content,
        ...(diary ? { removeImageIds } : {}),
      }),
    );
    images.forEach((image) => body.append("images", image));
    save.mutate(body, {
      onSuccess: (saved) => router.push(`/diaries/${saved.id}`),
    });
  };

  if (dogs.error) return <p role="alert">{dogs.error.message}</p>;
  if (!dogs.data) return <p role="status">반려견을 불러오고 있어요.</p>;

  const order = dogs.data.findIndex((dog) => dog.id === dogId);
  const left = Math.max(0, 5 - kept - images.length);
  // The real file input stays in the page behind its drawn box. Its name,
  // "사진 (최대 5장, 장당 5MB 이하)", is how screen readers and tests find it.
  const photoInput = (
    <input
      className={formStyles.visuallyHidden}
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp"
      aria-label="사진 (최대 5장, 장당 5MB 이하)"
      onChange={(event) =>
        setImages(Array.from(event.currentTarget.files ?? []))
      }
    />
  );
  const actions = (
    <div className={styles.formActions}>
      <Link href="/diaries" className={formStyles.secondary}>
        일기 목록
      </Link>
      <button className={formStyles.submit} disabled={save.isPending}>
        {save.isPending ? "저장 중…" : "저장하기"}
      </button>
    </div>
  );

  return (
    <form
      className={`${formStyles.form} ${diary ? `${formStyles.card} ${styles.editForm}` : styles.newForm}`}
      onSubmit={handleSubmit}
    >
      <fieldset className={styles.fields} disabled={save.isPending}>
        <legend className={formStyles.visuallyHidden}>반려견 일기</legend>
        <div className={styles.dogAndDate}>
          <label>
            반려견
            <span className={styles.picker}>
              {order >= 0 && (
                <DogFace
                  dog={dogs.data[order]}
                  className={styles.pickerFace}
                  size={50}
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
                  반려견을 골라 주세요
                </option>
                {dogs.data.map((dog) => (
                  <option key={dog.id} value={dog.id}>
                    {dog.name}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </span>
          </label>
          <label>
            산책한 날짜
            <input
              name="walkedOn"
              type="date"
              required
              defaultValue={diary?.walkedOn ?? today}
              max={today}
            />
          </label>
        </div>
        <label>
          {diary ? "일기 내용" : "글"}
          <span className={formStyles.counted}>
            <textarea
              name="content"
              required
              maxLength={2000}
              rows={diary ? 6 : 4}
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
        {diary ? (
          <div className={styles.photoField}>
            <div className={styles.photoHead}>
              <p>사진</p>
              <p>
                최대 5장 · 장당 5MB까지
                <span>
                  현재 {kept + images.length}장 첨부됨 (최대 {left}장 더 추가
                  가능)
                </span>
              </p>
            </div>
            <div className={styles.slots}>
              {diary.images.map((image, index) => (
                <div key={image.id} className={styles.slot}>
                  <DiaryImage
                    diaryId={diary.id}
                    imageId={image.id}
                    alt={`기존 일기 사진 ${index + 1}`}
                    className={styles.photo}
                  />
                  <label className={formStyles.checkbox}>
                    <input
                      type="checkbox"
                      checked={removeImageIds.includes(image.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setRemoveImageIds((ids) =>
                          checked
                            ? [...ids, image.id]
                            : ids.filter((id) => id !== image.id),
                        );
                      }}
                    />
                    이 사진 지우기
                  </label>
                </div>
              ))}
              <label className={styles.addSlot}>
                {photoInput}
                <CameraIcon />
                <strong>새 사진 추가</strong>
                <span>
                  {images.length > 0
                    ? `${images.length}장 골랐어요`
                    : "최대 5장 · 장당 5MB까지"}
                </span>
              </label>
              {Array.from(
                { length: Math.max(0, 4 - diary.images.length) },
                (_, index) => (
                  <span key={index} className={styles.emptySlot} />
                ),
              )}
            </div>
          </div>
        ) : (
          <div className={styles.photoField}>
            <p className={styles.photoLabel}>
              사진 <span className={formStyles.optional}>(선택 사항)</span>
            </p>
            <label className={styles.dropBox}>
              {photoInput}
              <PictureIcon size={40} />
              <strong>
                {images.length > 0
                  ? `${images.length}장 골랐어요`
                  : "사진을 추가해보세요."}
              </strong>
              <span>최대 5장 · 장당 5MB까지 업로드할 수 있어요.</span>
            </label>
          </div>
        )}
      </fieldset>
      {actions}
      {(photoError || error || save.error) && (
        <p role="alert">{photoError || error || save.error?.message}</p>
      )}
    </form>
  );
};
export default DiaryForm;
