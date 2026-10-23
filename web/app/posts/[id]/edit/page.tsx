"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AuthGate } from "../../../_components/auth-gate";
import { usePost } from "../../../../lib/api/posts";
import { ChevronLeft } from "../../../_components/icons";
import PostForm from "../../post-form";
import headingStyles from "../../../_components/heading.module.css";
import layoutStyles from "../../../_components/layout.module.css";

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
  <main className={layoutStyles.main}>
    <Link href="/posts" className={layoutStyles.back}>
      <ChevronLeft />
      게시판
    </Link>
    <div>
      <h1 className={`${headingStyles.title} ${headingStyles.formTitle}`}>
        글 수정
      </h1>
      <p className={`${headingStyles.lead} ${headingStyles.formLead}`}>
        게시글을 수정하고 저장할 수 있습니다.
      </p>
    </div>
    <AuthGate>
      <Suspense fallback={<p role="status">글을 불러오고 있어요.</p>}>
        <EditPost />
      </Suspense>
    </AuthGate>
  </main>
);
export default EditPostPage;
