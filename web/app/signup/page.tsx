"use client";

import signupScene from "../../public/illustrations/walking-drawing/signup-scene.png";
import signupSceneMobile from "../../public/illustrations/walking-drawing/signup-scene-mobile.png";
import styles from "../_components/auth.module.css";
import { SceneImage, ScenePage } from "../_components/walk-scene";
import { SignupForm } from "../_components/signup-form";

const SignupPage = () => {
  return (
    <ScenePage
      className={`${styles.content} ${styles.signup}`}
      scene={
        <SceneImage
          className={styles.signupScene}
          wide={signupScene}
          narrow={signupSceneMobile}
          narrowMedia="(max-width: 1024px)"
          loading="lazy"
          wideSizes="520px"
        />
      }
    >
      <SignupForm
        onSuccess={() => {
          // A full navigation keeps the login route out of the modal slot.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login");
        }}
      />
    </ScenePage>
  );
};
export default SignupPage;
