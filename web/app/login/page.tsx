"use client";

import { useRouter } from "next/navigation";
import loginSceneMobile from "../../public/illustrations/walking-drawing/login-scene-mobile.png";
import loginScene from "../../public/illustrations/walking-drawing/login-scene.png";
import styles from "../_components/auth.module.css";
import layoutStyles from "../_components/layout.module.css";
import { LoginForm } from "../_components/login-form";
import { SceneImage } from "../_components/walk-scene";

// The form on the left, the walk by the river in the space on the right.
const LoginPage = () => {
  const router = useRouter();

  return (
    <main
      className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.loginPage}`}
    >
      <div>
        <LoginForm onSuccess={() => router.push("/")} />
      </div>
      <SceneImage
        className={styles.pageScene}
        fill
        wide={loginScene}
        narrow={loginSceneMobile}
        narrowMedia="(max-width: 720px)"
        wideSizes="(max-width: 1024px) 90vw, 44vw"
      />
    </main>
  );
};
export default LoginPage;
