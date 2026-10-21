"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../_components/auth-gate";
import { useDeletePost, usePost } from "../../../lib/api/posts";
import { useAuthStore } from "../../../lib/auth-store";
import { Comments } from "../comments";
import styles from "../../_components/shared.module.css";
import postStyles from "../posts.module.css";

const PostDetail = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id);
  const query = usePost(Number(id));
  const remove = useDeletePost();
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p role="status">글을 불러오고 있어요.</p>;
  const post = query.data;

  return (
    <>
      <article className={styles.card} aria-label="게시글">
        <h2>{post.title}</h2>
        <p>{post.author.nickname}</p>
        <time dateTime={post.createdAt}>
          {new Date(post.createdAt).toLocaleString("ko-KR")}
        </time>
        <p className={postStyles.content}>{post.content}</p>
        {userId === post.author.id && (
          <div className={styles.actions}>
            <Link href={`/posts/${post.id}/edit`}>수정</Link>
            <button
              disabled={remove.isPending}
              onClick={() => {
                if (!window.confirm("글을 삭제할까요?")) return;
                remove.mutate(post.id, {
                  onSuccess: () => router.push("/posts"),
                });
              }}
            >
              {remove.isPending ? "삭제 중…" : "삭제"}
            </button>
          </div>
        )}
        {remove.error && <p role="alert">{remove.error.message}</p>}
      </article>
      <Comments key={post.id} postId={post.id} />
    </>
  );
};

const PostPage = () => (
  <main className={styles.main}>
    <h1>글 상세</h1>
    <AuthGate>
      <Suspense fallback={<p role="status">글을 불러오고 있어요.</p>}>
        <PostDetail />
      </Suspense>
    </AuthGate>
    <Link href="/posts">게시판 목록</Link>
  </main>
);
export default PostPage;
