"use client";

import { useState, type FormEvent } from "react";
import walkScene from "../../public/illustrations/walking-drawing/walk-scene.png";
import { applySavedUser, type User } from "../../lib/auth";
import { useUpdateMe } from "../../lib/api/users";
import { AuthGate } from "../_components/auth-gate";
import { useAuth } from "../_components/auth-provider";
import formStyles from "../_components/form.module.css";
import headingStyles from "../_components/heading.module.css";
import layoutStyles from "../_components/layout.module.css";
import { PersonFace } from "../_components/person-face";
import { SceneImage } from "../_components/walk-scene";
import styles from "./me.module.css";

const MePage = () => (
  <main className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.page}`}>
    <div>
      <h1 className={headingStyles.title}>내 정보</h1>
      <p className={headingStyles.lead}>닉네임과 비밀번호를 바꿀 수 있어요.</p>
    </div>
    <AuthGate>
      <AccountForms />
    </AuthGate>
    <SceneImage
      className={styles.scene}
      wide={walkScene}
      narrow={walkScene}
      narrowMedia="(max-width: 720px)"
      // Under the cards the drawing gets only the height they leave, so it
      // is narrower than the panel.
      wideSizes="(max-width: 1279px) 85vw, 50vw"
      loading="lazy"
      fill
    />
  </main>
);
export default MePage;

// Two cards that save separately. While either is saving, both buttons wait,
// so their answers never cross.
const AccountForms = () => {
  const { user } = useAuth();
  const updateNickname = useUpdateMe();
  const updatePassword = useUpdateMe();
  const saving = updateNickname.isPending || updatePassword.isPending;
  if (!user) return null;

  return (
    <div className={styles.cards}>
      <NicknameCard
        user={user}
        updateNickname={updateNickname}
        saving={saving}
      />
      <PasswordCard updatePassword={updatePassword} saving={saving} />
    </div>
  );
};

type UpdateMe = ReturnType<typeof useUpdateMe>;

const NicknameCard = ({
  user,
  updateNickname,
  saving,
}: {
  user: User;
  updateNickname: UpdateMe;
  saving: boolean;
}) => {
  const [done, setDone] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDone(false);
    const fields = new FormData(event.currentTarget);
    updateNickname.mutate(
      { nickname: String(fields.get("nickname") ?? "") },
      {
        // Only this answer carries the new nickname into the header.
        onSuccess: async (saved) => {
          await applySavedUser(saved);
          setDone(true);
        },
      },
    );
  };

  return (
    <form className={formStyles.form} onSubmit={handleSubmit}>
      <fieldset className={formStyles.card} disabled={saving}>
        <legend>프로필</legend>
        <div className={styles.who}>
          <PersonFace userId={user.id} size={64} />
          <p>
            <span className={styles.label}>이메일</span>
            {user.email}
          </p>
        </div>
        <label>
          닉네임
          <span className={formStyles.control}>
            <input
              name="nickname"
              required
              minLength={2}
              maxLength={20}
              defaultValue={user.nickname}
              autoComplete="nickname"
            />
          </span>
        </label>
        <button className={formStyles.submit}>
          {updateNickname.isPending ? "저장 중…" : "닉네임 저장"}
        </button>
        {updateNickname.error && (
          <p role="alert">{updateNickname.error.message}</p>
        )}
        {done && <p role="status">닉네임을 바꿨어요.</p>}
      </fieldset>
    </form>
  );
};

const PasswordCard = ({
  updatePassword,
  saving,
}: {
  updatePassword: UpdateMe;
  saving: boolean;
}) => {
  const [error, setError] = useState("");
  const alert = error || updatePassword.error?.message;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    updatePassword.reset();
    const fields = new FormData(form);
    const newPassword = String(fields.get("newPassword") ?? "");
    if (newPassword !== fields.get("confirmPassword")) {
      setError("새 비밀번호가 서로 달라요.");
      return;
    }
    updatePassword.mutate(
      {
        currentPassword: String(fields.get("currentPassword") ?? ""),
        newPassword,
      },
      {
        // The answer's user is not used: the nickname card owns that, and an
        // old nickname arriving late must not undo a newer one.
        onSuccess: () => form.reset(),
      },
    );
  };

  return (
    <form className={formStyles.form} onSubmit={handleSubmit}>
      <fieldset className={formStyles.card} disabled={saving}>
        <legend>비밀번호 바꾸기</legend>
        <label>
          현재 비밀번호
          <span className={formStyles.control}>
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </span>
        </label>
        <label>
          새 비밀번호
          <span className={formStyles.control}>
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              maxLength={20}
              autoComplete="new-password"
              placeholder="8~20자"
            />
          </span>
        </label>
        <label>
          새 비밀번호 확인
          <span className={formStyles.control}>
            <input
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
            />
          </span>
        </label>
        <button className={formStyles.submit}>
          {updatePassword.isPending ? "바꾸는 중…" : "비밀번호 바꾸기"}
        </button>
        {alert && <p role="alert">{alert}</p>}
        {updatePassword.isSuccess && <p role="status">비밀번호를 바꿨어요.</p>}
      </fieldset>
    </form>
  );
};
