"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSavePost } from "../../lib/api/posts";
import type { Post } from "../../lib/types";
import formStyles from "../_components/form.module.css";
import styles from "./posts.module.css";

const PostForm = ({ post }: { post?: Post }) => {
  const router = useRouter();
  const save = useSavePost(post?.id);
  const [error, setError] = useState("");
  const [titleLength, setTitleLength] = useState(post?.title.length ?? 0);
  const [contentLength, setContentLength] = useState(
    post?.content.length ?? 0,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    save.reset();
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title") ?? "").trim();
    const content = String(fields.get("content") ?? "").trim();
    if (!title || !content) {
      setError(`제목과 ${post ? "내용" : "본문"}을 입력해 주세요.`);
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
      className={`${formStyles.form} ${post ? styles.editForm : styles.newForm}`}
      onSubmit={handleSubmit}
    >
      <fieldset className={styles.fields} disabled={save.isPending}>
        <legend className={formStyles.visuallyHidden}>게시글</legend>
        <label>
          <span className={styles.fieldLabel}>
            제목
            {/* Drawn hints stay out of the label text, so the field is still
                named exactly "제목". */}
            <span
              className={styles.hint}
              aria-hidden="true"
              data-hint={post ? `${titleLength} / 50` : "(최대 50자)"}
            />
          </span>
          <span className={formStyles.counted}>
            <input
              name="title"
              required
              maxLength={50}
              defaultValue={post?.title ?? ""}
              placeholder="제목을 입력해주세요."
              onChange={(event) =>
                setTitleLength(event.currentTarget.value.length)
              }
            />
            {!post && (
              <span
                className={formStyles.count}
                aria-hidden="true"
                data-count={`${titleLength} / 50`}
              />
            )}
          </span>
        </label>
        <label>
          <span className={styles.fieldLabel}>
            {post ? "내용" : "본문"}
            <span
              className={styles.hint}
              aria-hidden="true"
              data-hint={post ? `${contentLength} / 2000` : "(최대 2000자)"}
            />
          </span>
          <span className={formStyles.counted}>
            <textarea
              name="content"
              required
              maxLength={2000}
              rows={12}
              defaultValue={post?.content ?? ""}
              placeholder="내용을 입력해주세요."
              onChange={(event) =>
                setContentLength(event.currentTarget.value.length)
              }
            />
            {!post && (
              <span
                className={formStyles.count}
                aria-hidden="true"
                data-count={`${contentLength} / 2000`}
              />
            )}
          </span>
        </label>
      </fieldset>
      <div className={styles.formActions}>
        <Link href="/posts" className={formStyles.secondary}>
          게시판 목록
        </Link>
        <button className={formStyles.submit} disabled={save.isPending}>
          {save.isPending ? "저장 중…" : "저장하기"}
        </button>
      </div>
      {(error || save.error) && (
        <p role="alert">{error || save.error?.message}</p>
      )}
    </form>
  );
};
export default PostForm;
