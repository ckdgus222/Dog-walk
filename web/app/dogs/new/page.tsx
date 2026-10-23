"use client";

import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import headingStyles from "../../_components/heading.module.css";
import { ArrowLeft } from "../../_components/icons";
import layoutStyles from "../../_components/layout.module.css";
import DogForm from "../dog-form";

const NewDogPage = () => {
  return (
    <main className={layoutStyles.main}>
      <Link
        href="/dogs"
        className={`${layoutStyles.back} ${layoutStyles.backAccent}`}
      >
        <ArrowLeft />
        내 반려견으로 돌아가기
      </Link>
      <div>
        <h1 className={`${headingStyles.title} ${headingStyles.formTitle}`}>
          반려견 추가
        </h1>
        <p className={`${headingStyles.lead} ${headingStyles.formLead}`}>
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
