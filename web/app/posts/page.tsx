"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../_components/auth-gate";
import { secondaryButton as pageButton } from "../_components/buttons";
import { EmptyState } from "../_components/empty-state";
import formStyles from "../_components/form.module.css";
import {
  ArrowLeft,
  ArrowRight,
  ChatIcon,
  ChevronRight,
} from "../_components/icons";
import headingStyles from "../_components/heading.module.css";
import layoutStyles from "../_components/layout.module.css";
import { PersonFace } from "../_components/person-face";
import uiStyles from "../_components/ui.module.css";
import { usePosts } from "../../lib/api/posts";
import communityChat from "../../public/illustrations/walking-drawing/community-chat.svg";
import styles from "./posts.module.css";

// "2026.10.22", as in the list mockup.
const listDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replaceAll(" ", "")
    .replace(/\.$/, "");

const PostList = () => {
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const query = usePosts(page);

  return (
    <>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">글을 불러오고 있어요.</p>}
      {!!query.data?.posts.length && (
        <div className={`${uiStyles.list} ${styles.list}`}>
          {/* Screen readers get each column's meaning from the row itself. */}
          <p className={styles.columns} aria-hidden="true">
            <span>제목</span>
            <span>작성자</span>
            <span>작성일</span>
            <span>댓글</span>
          </p>
          {query.data.posts.map((post) => (
            <article
              key={post.id}
              className={`${uiStyles.listRow} ${styles.row}`}
            >
              <h2>
                <Link href={`/posts/${post.id}`}>
                  {post.title}
                  {/* Kept in the link name; the count column shows it on screen. */}
                  {post.commentCount > 0 && (
                    <span className={formStyles.visuallyHidden}>
                      {` [${post.commentCount}]`}
                    </span>
                  )}
                </Link>
              </h2>
              <p className={styles.author}>
                <PersonFace userId={post.author.id} size={32} />
                <span>{post.author.nickname}</span>
              </p>
              <time
                className={`${uiStyles.meta} ${styles.date}`}
                dateTime={post.createdAt}
              >
                {listDate(post.createdAt)}
              </time>
              <span className={styles.count} aria-hidden="true">
                <ChatIcon />
                {post.commentCount}
              </span>
              <ChevronRight size={22} />
            </article>
          ))}
        </div>
      )}
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
              <EmptyState
                image={communityChat}
                title="아직 글이 없어요."
                description="우리 동네 반려인들에게 첫 이야기를 건네 보세요."
                action={{ href: "/posts/new", label: "첫 글 쓰기" }}
              />
            )}
            {/* An unusable step stays visible but is not a link. */}
            <nav aria-label="게시판 페이지" className={styles.pages}>
              {page > 1 ? (
                <Link href={`/posts?page=${page - 1}`} className={pageButton}>
                  <ArrowLeft />
                  이전
                </Link>
              ) : (
                <span className={`${pageButton} ${styles.off}`}>
                  <ArrowLeft />
                  이전
                </span>
              )}
              <span>
                <strong>{page}</strong> / {query.data.totalPages}
              </span>
              {page < query.data.totalPages ? (
                <Link href={`/posts?page=${page + 1}`} className={pageButton}>
                  다음
                  <ArrowRight size={18} />
                </Link>
              ) : (
                <span className={`${pageButton} ${styles.off}`}>
                  다음
                  <ArrowRight size={18} />
                </span>
              )}
            </nav>
          </>
        ))}
    </>
  );
};

const PostsPage = () => (
  <main
    className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.listPage}`}
  >
    <div className={layoutStyles.head}>
      <div>
        <h1 className={headingStyles.title}>게시판</h1>
        <p className={headingStyles.lead}>
          우리 동네 반려인들과 자유롭게 이야기를 나눠요.
        </p>
      </div>
      <Link href="/posts/new" className={layoutStyles.headAction}>
        글쓰기
        <ArrowRight />
      </Link>
    </div>
    <AuthGate>
      <Suspense fallback={<p role="status">글을 불러오고 있어요.</p>}>
        <PostList />
      </Suspense>
    </AuthGate>
  </main>
);
export default PostsPage;
