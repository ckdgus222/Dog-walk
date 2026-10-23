import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import PostForm from "../post-form";
import headingStyles from "../../_components/heading.module.css";
import layoutStyles from "../../_components/layout.module.css";

const NewPostPage = () => (
  <main className={layoutStyles.main}>
    <Link href="/posts" className={layoutStyles.back}>
      <span aria-hidden="true">‹</span>게시판 목록
    </Link>
    <div>
      <h1 className={headingStyles.title}>글쓰기</h1>
      <p className={headingStyles.lead}>우리 동네 강아지와 일상에 대한 이야기를 자유롭게 나눠주세요.</p>
    </div>
    <AuthGate>
      <PostForm />
    </AuthGate>
  </main>
);
export default NewPostPage;
