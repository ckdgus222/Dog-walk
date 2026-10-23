import type { Dog } from "../../lib/types";
import { genderLabels, sizeLabels } from "./dog-card";
import styles from "./form.module.css";

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
    <Choices name="size" legend="크기" labels={sizeLabels} value={dog?.size} />
    <Choices
      name="gender"
      legend="성별"
      labels={genderLabels}
      value={dog?.gender}
    />
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

// One required radio group drawn as a row of buttons.
const Choices = ({
  name,
  legend,
  labels,
  value,
}: {
  name: string;
  legend: string;
  labels: Record<string, string>;
  value?: string;
}) => (
  <fieldset className={styles.choices}>
    <legend>{legend}</legend>
    <div>
      {Object.entries(labels).map(([option, label]) => (
        <label key={option}>
          <input
            name={name}
            type="radio"
            value={option}
            defaultChecked={value === option}
            required
          />
          {label}
        </label>
      ))}
    </div>
  </fieldset>
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
