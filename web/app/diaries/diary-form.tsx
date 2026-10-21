"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMyDogs } from "../../lib/api/dogs";
import { useSaveDiary } from "../../lib/api/diaries";
import type { Diary } from "../../lib/types";
import { DiaryImage } from "./diary-image";
import styles from "../_components/shared.module.css";

const DiaryForm = ({ diary }: { diary?: Diary }) => {
  const router = useRouter();
  const dogs = useMyDogs();
  const save = useSaveDiary(diary?.id);
  const [error, setError] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [removeImageIds, setRemoveImageIds] = useState<number[]>([]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const photoError = images.some((image) => image.size > 5 * 1024 * 1024)
    ? "사진은 5MB 이하로 골라 주세요."
    : (diary?.images.length ?? 0) - removeImageIds.length + images.length > 5
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

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <fieldset disabled={save.isPending}>
        <legend>반려견 일기</legend>
        <label>
          반려견
          <select name="dogId" required defaultValue={diary?.dog.id ?? ""}>
            <option value="" disabled>
              반려견을 골라 주세요
            </option>
            {dogs.data.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
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
        <label>
          글
          <textarea
            name="content"
            required
            maxLength={2000}
            rows={8}
            defaultValue={diary?.content ?? ""}
          />
        </label>
        {diary?.images.map((image, index) => (
          <div key={image.id}>
            <DiaryImage
              diaryId={diary.id}
              imageId={image.id}
              alt={`기존 일기 사진 ${index + 1}`}
            />
            <label className={styles.checkbox}>
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
        <label>
          사진 (최대 5장, 장당 5MB 이하)
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              setImages(Array.from(event.currentTarget.files ?? []))
            }
          />
        </label>
      </fieldset>
      <button disabled={save.isPending}>
        {save.isPending ? "저장 중…" : "저장하기"}
      </button>
      {(photoError || error || save.error) && (
        <p role="alert">{photoError || error || save.error?.message}</p>
      )}
    </form>
  );
};
export default DiaryForm;
