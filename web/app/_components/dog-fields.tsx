import { useState, useSyncExternalStore } from "react";
import type { Dog } from "../../lib/types";
import { genderLabels, sizeLabels } from "./dog-card";
import styles from "./form.module.css";

// The three mockups draw the same dog fields differently, so each form says
// which one it is.
type Variant = "signup" | "add" | "edit";

const copy = {
  signup: {
    name: "1~20자의 이름을 입력해주세요",
    breed: "1~30자의 견종을 입력해주세요",
    personality: "1~100자의 성격을 소개해주세요",
    birthYear: "태어난 해를 선택해주세요",
    neutered: "중성화",
    choices: styles.radioChoices,
  },
  add: {
    name: "1자 이상 20자 이하로 입력해 주세요.",
    breed: "1자 이상 30자 이하로 입력해 주세요.",
    personality: "1자 이상 100자 이하로 입력해 주세요.",
    birthYear: "태어난 해를 선택해 주세요.",
    neutered: "중성화",
    choices: styles.buttonChoices,
  },
  edit: {
    name: undefined,
    breed: undefined,
    personality: undefined,
    birthYear: undefined,
    neutered: "중성화 여부",
    choices: styles.sageChoices,
  },
};

const firstYear = 1990;

// The current year is read only in the browser. Prerendering must not freeze
// it into the page, so the server snapshot is null and the year list fills in
// right after the page loads.
const noSubscription = () => () => {};
const useThisYear = () =>
  useSyncExternalStore(
    noSubscription,
    () => new Date().getFullYear(),
    () => null,
  );

export const DogFields = ({
  dog,
  variant,
}: {
  dog?: Dog;
  variant: Variant;
}) => {
  const text = copy[variant];
  const counted = variant !== "signup";
  const thisYear = useThisYear();

  return (
    <>
      <label>
        <span>
          이름
          <Required />
        </span>
        <CountedInput
          name="name"
          maxLength={20}
          defaultValue={dog?.name}
          placeholder={text.name}
          counted={counted}
        />
      </label>
      <label>
        <span>
          견종
          <Required />
        </span>
        <CountedInput
          name="breed"
          maxLength={30}
          defaultValue={dog?.breed}
          placeholder={text.breed}
          counted={counted}
        />
      </label>
      <Choices
        name="size"
        legend="크기"
        labels={sizeLabels}
        value={dog?.size}
        className={text.choices}
      />
      <Choices
        name="gender"
        legend="성별"
        labels={genderLabels}
        value={dog?.gender}
        className={text.choices}
      />
      <div className={styles.fieldRow}>
        <span>{text.neutered}</span>
        <label className={styles.checkbox}>
          <input
            name="neutered"
            type="checkbox"
            defaultChecked={dog?.neutered}
          />
          중성화했어요
          {variant === "add" && (
            <span className={styles.optional}> (선택사항)</span>
          )}
        </label>
      </div>
      {variant === "edit" ? (
        <label>
          <span>
            태어난 해
            <Required />
          </span>
          <span className={styles.withHint}>
            <input
              name="birthYear"
              type="number"
              min={firstYear}
              max={thisYear ?? undefined}
              step={1}
              defaultValue={dog?.birthYear}
              aria-describedby="birth-year-help"
              required
            />
            {thisYear && (
              <span id="birth-year-help" aria-hidden="true">
                {firstYear} - {thisYear}년 사이
              </span>
            )}
          </span>
        </label>
      ) : (
        <label>
          <span>
            태어난 해
            <Required />
          </span>
          <select
            name="birthYear"
            defaultValue=""
            required
          >
            <option value="" disabled>
              {text.birthYear}
            </option>
            {thisYear &&
              Array.from({ length: thisYear - firstYear + 1 }, (_, index) => {
                const year = thisYear - index;
                return (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                );
              })}
          </select>
        </label>
      )}
      <label>
        <span>
          성격 소개
          <Required />
        </span>
        <CountedInput
          name="personality"
          maxLength={100}
          defaultValue={dog?.personality}
          placeholder={text.personality}
          counted={counted}
          multiline
        />
      </label>
    </>
  );
};

// The star and the counter are drawn by CSS, so they never become part of
// the label text that names the field.
export const Required = () => (
  <span className={styles.required} aria-hidden="true" />
);

// A required text field that can show "length/max" in its corner.
const CountedInput = ({
  name,
  maxLength,
  defaultValue = "",
  placeholder,
  counted,
  multiline = false,
}: {
  name: string;
  maxLength: number;
  defaultValue?: string;
  placeholder?: string;
  counted: boolean;
  multiline?: boolean;
}) => {
  const [length, setLength] = useState(defaultValue.length);
  const field = {
    name,
    maxLength,
    defaultValue,
    placeholder,
    required: true,
    onChange: counted
      ? (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setLength(event.currentTarget.value.length)
      : undefined,
  };

  return (
    <span className={styles.counted}>
      {multiline ? <textarea rows={3} {...field} /> : <input {...field} />}
      {counted && (
        <span
          className={styles.count}
          aria-hidden="true"
          data-count={`${length}/${maxLength}`}
        />
      )}
    </span>
  );
};

// One required radio group. The look (round radios or buttons) comes from
// the form that uses it.
const Choices = ({
  name,
  legend,
  labels,
  value,
  className,
}: {
  name: string;
  legend: string;
  labels: Record<string, string>;
  value?: string;
  className: string;
}) => (
  <fieldset className={`${styles.choices} ${className}`}>
    <legend>
      {legend}
      <Required />
    </legend>
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
