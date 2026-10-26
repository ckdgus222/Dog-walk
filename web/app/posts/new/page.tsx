import Link from "next/link";
import { AuthGate } from "../../_components/auth-gate";
import { ChevronLeft } from "../../_components/icons";
import PostForm from "../post-form";
import headingStyles from "../../_components/heading.module.css";
import layoutStyles from "../../_components/layout.module.css";
import styles from "../posts.module.css";

const NewPostPage = () => (
  <main
    className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.formPage}`}
  >
    <Link href="/posts" className={layoutStyles.back}>
      <ChevronLeft />
      게시판
    </Link>
    <div>
      <h1 className={headingStyles.title}>글쓰기</h1>
      <p className={headingStyles.lead}>
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
