"use client";

import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import headingStyles from "../../_components/heading.module.css";
import { ChevronLeft } from "../../_components/icons";
import layoutStyles from "../../_components/layout.module.css";
import DogForm from "../dog-form";
import styles from "../dogs.module.css";

const NewDogPage = () => {
  return (
    <main
      className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.formPage}`}
    >
      <Link href="/dogs" className={layoutStyles.back}>
        <ChevronLeft />
        내 반려견
      </Link>
      <div>
        <h1 className={headingStyles.title}>반려견 추가</h1>
        <p className={headingStyles.lead}>
          새로운 가족을 소개해 주세요.
          <br />
          정확한 정보를 입력하면, 주변 친구들과 더 잘 연결될 수 있어요.
        </p>
      </div>
      <AuthGate>
        <DogForm />
      </AuthGate>
    </main>
  );
};
export default NewDogPage;
