import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import PostForm from "../post-form";
import styles from "../../_components/shared.module.css";

const NewPostPage = () => (
  <main className={styles.main}>
    <h1>글쓰기</h1>
    <AuthGate>
      <PostForm />
    </AuthGate>
    <Link href="/posts">게시판 목록</Link>
  </main>
);
export default NewPostPage;
