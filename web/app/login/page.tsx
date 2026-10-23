"use client";

import { useRouter } from "next/navigation";
import loginScene from "../../public/illustrations/walking-drawing/login-scene.png";
import loginSceneMobile from "../../public/illustrations/walking-drawing/login-scene-mobile.png";
import styles from "../_components/auth.module.css";
import { SceneImage, ScenePage } from "../_components/walk-scene";
import { LoginForm } from "../_components/login-form";

const LoginPage = () => {
  const router = useRouter();

  return (
    <ScenePage
      className={`${styles.content} ${styles.login}`}
      scene={
        <SceneImage
          className={styles.loginScene}
          wide={loginScene}
          narrow={loginSceneMobile}
          narrowMedia="(max-width: 720px)"
          wideSizes="(max-width: 1600px) 100vw, 1600px"
        />
      }
    >
      <LoginForm onSuccess={() => router.push("/")} />
    </ScenePage>
  );
};
export default LoginPage;
