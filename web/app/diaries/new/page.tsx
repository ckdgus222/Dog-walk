import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import headingStyles from "../../_components/heading.module.css";
import layoutStyles from "../../_components/layout.module.css";
import DiaryForm from "../diary-form";

const NewDiaryPage = () => (
  <main className={layoutStyles.main}>
    <Link href="/diaries" className={layoutStyles.back}>
      <span aria-hidden="true">‹</span>일기 목록
    </Link>
    <div>
      <p className={headingStyles.eyebrow}>일기 쓰기</p>
      <h1 className={headingStyles.title}>오늘의 산책을 기록해요</h1>
      <p className={headingStyles.lead}>
        우리 아이와 함께한 소중한 순간을, 나만의 일기에 남겨보세요.
      </p>
    </div>
    <AuthGate>
      <DiaryForm />
    </AuthGate>
  </main>
);
export default NewDiaryPage;
