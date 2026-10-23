"use client";

import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import headingStyles from "../../_components/heading.module.css";
import layoutStyles from "../../_components/layout.module.css";
import DogForm from "../dog-form";

const NewDogPage = () => {
  return (
    <main className={layoutStyles.main}>
      <Link href="/dogs" className={layoutStyles.back}>
        <span aria-hidden="true">‹</span>내 반려견
      </Link>
      <div>
        <h1 className={headingStyles.title}>반려견 추가</h1>
        <p className={headingStyles.lead}>새로운 가족을 소개해 주세요.</p>
      </div>
      <AuthGate>
        <DogForm />
      </AuthGate>
    </main>
  );
};
export default NewDogPage;
