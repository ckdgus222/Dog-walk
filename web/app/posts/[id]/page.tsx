"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../_components/auth-gate";
import layoutStyles from "../../_components/layout.module.css";
import { useDeletePost, usePost } from "../../../lib/api/posts";
import { useAuthStore } from "../../../lib/auth-store";
import { ChevronLeft } from "../../_components/icons";
import { Comments } from "../comments";
import styles from "../posts.module.css";

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
      <article className={styles.post} aria-label="게시글">
        <h1>{post.title}</h1>
        <div className={styles.byline}>
          <p className={styles.author}>{post.author.nickname}</p>
          <time dateTime={post.createdAt}>
            {new Date(post.createdAt).toLocaleDateString("ko-KR")}
          </time>
        </div>
        {userId === post.author.id && (
          <div className={styles.actions}>
            <Link
              href={`/posts/${post.id}/edit`}
              className={styles.primary}
            >
              글 수정
            </Link>
            <button
              className={styles.secondary}
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
        <p className={styles.content}>{post.content}</p>
        {remove.error && <p role="alert">{remove.error.message}</p>}
      </article>
      <Comments key={post.id} postId={post.id} />
    </>
  );
};

const PostPage = () => (
  <main className={layoutStyles.main}>
    <Link
      href="/posts"
      className={`${layoutStyles.back} ${styles.detailBack}`}
    >
      <ChevronLeft />
      게시판 목록
    </Link>
    <AuthGate>
      <Suspense fallback={<p role="status">글을 불러오고 있어요.</p>}>
        <PostDetail />
      </Suspense>
    </AuthGate>
  </main>
);
export default PostPage;
