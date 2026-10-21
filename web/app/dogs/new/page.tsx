"use client";

import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import DogForm from "../dog-form";
import styles from "../../_components/shared.module.css";

const NewDogPage = () => {
  return (
    <main className={styles.main}>
      <h1>반려견 추가</h1>
      <AuthGate>
        <DogForm />
      </AuthGate>
      <Link href="/dogs">내 반려견</Link>
    </main>
  );
};
export default NewDogPage;
