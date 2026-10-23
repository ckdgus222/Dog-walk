"use client";

import { AuthGate } from "../../_components/auth-gate";
import { useAuth } from "../../_components/auth-provider";
import headingStyles from "../../_components/heading.module.css";
import { LockLineIcon } from "../../_components/icons";
import layoutStyles from "../../_components/layout.module.css";
import DiaryForm from "../diary-form";
import styles from "../diaries.module.css";

// The form takes the left column; the right column is kept for the writing
// scene drawing (see docs/design-walking-drawing-assets.md).
const NewDiaryPage = () => {
  const { user } = useAuth();
  return (
    <main className={`${layoutStyles.main} ${styles.newPage}`}>
      <div>
        <p className={headingStyles.eyebrow}>
          {user ? `${user.nickname}님, 일기 쓰기` : "일기 쓰기"}
        </p>
        <h1 className={`${headingStyles.title} ${headingStyles.formTitle}`}>
          오늘의 산책을 기록해요
        </h1>
        <p className={`${headingStyles.lead} ${headingStyles.formLead}`}>
          우리 아이와 함께한 소중한 순간을, 나만의 일기에 남겨보세요.
        </p>
      </div>
      <p className={styles.privateNote}>
        <LockLineIcon />
        <span>
          나만 볼 수 있어요.
          <small>이 일기는 나에게만 공개됩니다.</small>
        </span>
      </p>
      <AuthGate>
        <DiaryForm />
      </AuthGate>
    </main>
  );
};
export default NewDiaryPage;
