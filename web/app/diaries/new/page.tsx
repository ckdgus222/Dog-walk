import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import DiaryForm from "../diary-form";
import styles from "../../_components/shared.module.css";

const NewDiaryPage = () => (
  <main className={styles.main}>
    <h1>일기 쓰기</h1>
    <AuthGate>
      <DiaryForm />
    </AuthGate>
    <Link href="/diaries">일기 목록</Link>
  </main>
);
export default NewDiaryPage;
