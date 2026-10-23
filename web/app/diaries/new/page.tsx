"use client";

import writingScene from "../../../public/illustrations/walking-drawing/writing-scene.png";
import writingSceneMobile from "../../../public/illustrations/walking-drawing/writing-scene-mobile.png";
import { AuthGate } from "../../_components/auth-gate";
import { useAuth } from "../../_components/auth-provider";
import headingStyles from "../../_components/heading.module.css";
import { LockLineIcon } from "../../_components/icons";
import layoutStyles from "../../_components/layout.module.css";
import { SceneImage } from "../../_components/walk-scene";
import DiaryForm from "../diary-form";
import styles from "../diaries.module.css";

// The form takes the left column and the writing drawing the right one.
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
      {/* The drawing comes with the form, so a short page without it does not
          stretch to the drawing's height. */}
      <AuthGate>
        <DiaryForm />
        <SceneImage
          className={styles.writingScene}
          wide={writingScene}
          narrow={writingSceneMobile}
          narrowMedia="(max-width: 1024px)"
          loading="lazy"
          wideSizes="475px"
        />
      </AuthGate>
    </main>
  );
};
export default NewDiaryPage;
