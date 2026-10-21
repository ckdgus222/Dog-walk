import type { Dog } from "../../lib/types";
import styles from "./shared.module.css";

export const DogFields = ({ dog }: { dog?: Dog }) => (
  <>
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
  </>
);

export const readDogFields = (form: FormData) => ({
  name: form.get("name"),
  breed: form.get("breed"),
  size: form.get("size"),
  gender: form.get("gender"),
  neutered: form.get("neutered") === "on",
  birthYear: Number(form.get("birthYear")),
  personality: form.get("personality"),
});
