"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../_components/auth-gate";
import { usePosts } from "../../lib/api/posts";
import styles from "../_components/shared.module.css";

const PostList = () => {
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const query = usePosts(page);

  return (
    <>
      <Link href="/posts/new">글쓰기</Link>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">글을 불러오고 있어요.</p>}
      <div className={styles.cards}>
        {query.data?.posts.map((post) => (
          <article key={post.id} className={styles.card}>
            <h2>
              <Link href={`/posts/${post.id}`}>
                {post.title}
                {post.commentCount > 0 ? ` [${post.commentCount}]` : ""}
              </Link>
            </h2>
            <p>{post.author.nickname}</p>
            <time dateTime={post.createdAt}>
              {new Date(post.createdAt).toLocaleString("ko-KR")}
            </time>
          </article>
        ))}
      </div>
      {query.data &&
        (page > query.data.totalPages ? (
          <>
            <p>이 페이지에는 글이 없어요.</p>
            <Link href={`/posts?page=${query.data.totalPages}`}>
              마지막 페이지로
            </Link>
          </>
        ) : (
          <>
            {page === 1 && query.data.posts.length === 0 && (
              <p>아직 글이 없어요.</p>
            )}
            <nav aria-label="게시판 페이지" className={styles.actions}>
              {page > 1 && <Link href={`/posts?page=${page - 1}`}>이전</Link>}
              <span>
                {page} / {query.data.totalPages}
              </span>
              {page < query.data.totalPages && (
                <Link href={`/posts?page=${page + 1}`}>다음</Link>
              )}
            </nav>
          </>
        ))}
    </>
  );
};

const PostsPage = () => (
  <main className={styles.main}>
    <h1>게시판</h1>
    <AuthGate>
      <Suspense fallback={<p role="status">글을 불러오고 있어요.</p>}>
        <PostList />
      </Suspense>
    </AuthGate>
    <Link href="/">홈으로</Link>
  </main>
);
export default PostsPage;
