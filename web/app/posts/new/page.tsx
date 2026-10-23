import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import { ChevronRight } from "../../_components/icons";
import PostForm from "../post-form";
import styles from "../posts.module.css";
import headingStyles from "../../_components/heading.module.css";
import layoutStyles from "../../_components/layout.module.css";

const NewPostPage = () => (
  <main className={layoutStyles.main}>
    <nav aria-label="경로" className={styles.crumbs}>
      <Link href="/posts">게시판</Link>
      <ChevronRight size={16} />
      <span aria-current="page">글쓰기</span>
    </nav>
    <div>
      <h1 className={`${headingStyles.title} ${headingStyles.formTitle}`}>
        글쓰기
      </h1>
      <p className={`${headingStyles.lead} ${headingStyles.formLead}`}>
        우리 동네 강아지와 일상에 대한 이야기를 자유롭게 나눠주세요.
        <br />
        서로의 경험과 고민이 더 즐거운 산책 문화를 만들어갑니다.
      </p>
    </div>
    <AuthGate>
      <PostForm />
    </AuthGate>
  </main>
);
export default NewPostPage;
