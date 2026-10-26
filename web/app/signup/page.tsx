"use client";

import signupSceneMobile from "../../public/illustrations/walking-drawing/signup-scene-mobile.png";
import signupScene from "../../public/illustrations/walking-drawing/signup-scene.png";
import styles from "../_components/auth.module.css";
import layoutStyles from "../_components/layout.module.css";
import { SignupForm } from "../_components/signup-form";
import { SceneImage } from "../_components/walk-scene";

const SignupPage = () => {
  return (
    <main
      className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.signupPage}`}
    >
      <SignupForm
        onSuccess={() => {
          // A full navigation keeps the login route out of the modal slot.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login");
        }}
      />
      <SceneImage
        className={styles.pageScene}
        fill
        wide={signupScene}
        narrow={signupSceneMobile}
        narrowMedia="(max-width: 1279px)"
        wideSizes="20vw"
        loading="lazy"
      />
    </main>
  );
};
export default SignupPage;
