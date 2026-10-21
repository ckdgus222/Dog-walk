"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../../_components/auth-gate";
import { usePost } from "../../../../lib/api/posts";
import PostForm from "../../post-form";
import styles from "../../../_components/shared.module.css";

const EditPost = () => {
  const { id } = useParams<{ id: string }>();
  const query = usePost(Number(id), true);
  if (query.isFetching) return <p role="status">글을 불러오고 있어요.</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (query.isSuccess)
    return <PostForm key={query.data.id} post={query.data} />;
  return <p role="status">글을 불러오고 있어요.</p>;
};

const EditPostPage = () => (
  <main className={styles.main}>
    <h1>글 수정</h1>
    <AuthGate>
      <Suspense fallback={<p role="status">글을 불러오고 있어요.</p>}>
        <EditPost />
      </Suspense>
    </AuthGate>
    <Link href="/posts">게시판 목록</Link>
  </main>
);
export default EditPostPage;
