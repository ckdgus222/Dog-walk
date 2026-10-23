"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSavePost } from "../../lib/api/posts";
import type { Post } from "../../lib/types";
import formStyles from "../_components/form.module.css";

const PostForm = ({ post }: { post?: Post }) => {
  const router = useRouter();
  const save = useSavePost(post?.id);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    save.reset();
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title") ?? "").trim();
    const content = String(fields.get("content") ?? "").trim();
    if (!title || !content) {
      setError("제목과 본문을 입력해 주세요.");
      return;
    }
    save.mutate(
      { title, content },
      {
        onSuccess: (saved) => router.push(`/posts/${saved.id}`),
      },
    );
  };

  return (
    <form
      className={`${formStyles.form} ${formStyles.pageForm}`}
      onSubmit={handleSubmit}
    >
      <fieldset className={formStyles.card} disabled={save.isPending}>
        <legend>게시글</legend>
        <label>
          제목
          <input
            name="title"
            required
            maxLength={50}
            defaultValue={post?.title ?? ""}
          />
        </label>
        <label>
          본문
          <textarea
            name="content"
            required
            maxLength={2000}
            rows={12}
            defaultValue={post?.content ?? ""}
          />
        </label>
      </fieldset>
      <button className={formStyles.submit} disabled={save.isPending}>
        {save.isPending ? "저장 중…" : "저장하기"}
      </button>
      {(error || save.error) && (
        <p role="alert">{error || save.error?.message}</p>
      )}
    </form>
  );
};
export default PostForm;
