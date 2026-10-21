"use client";

import { useState, type FormEvent } from "react";
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useUpdateComment,
} from "../../lib/api/posts";
import { useAuthStore } from "../../lib/auth-store";
import type { Comment } from "../../lib/types";
import styles from "../_components/shared.module.css";
import postStyles from "./posts.module.css";

const CommentItem = ({ comment }: { comment: Comment }) => {
  const userId = useAuthStore((state) => state.user?.id);
  const update = useUpdateComment(comment.postId);
  const remove = useDeleteComment(comment.postId);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(comment.content);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    update.reset();
    if (!content.trim()) {
      setError("댓글을 입력해 주세요.");
      return;
    }
    update.mutate(
      { id: comment.id, content: content.trim() },
      {
        onSuccess: () => setEditing(false),
      },
    );
  };

  return (
    <article className={styles.card}>
      <p>{comment.author.nickname}</p>
      <time dateTime={comment.createdAt}>
        {new Date(comment.createdAt).toLocaleString("ko-KR")}
      </time>
      {editing ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            댓글 수정
            <textarea
              required
              maxLength={300}
              value={content}
              disabled={update.isPending}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button disabled={update.isPending}>저장</button>
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => {
                setEditing(false);
                setError("");
                update.reset();
              }}
            >
              취소
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className={postStyles.content}>{comment.content}</p>
          {userId === comment.author.id && (
            <div className={styles.actions}>
              <button
                disabled={remove.isPending}
                onClick={() => {
                  setContent(comment.content);
                  setEditing(true);
                  setError("");
                  update.reset();
                  remove.reset();
                }}
              >
                수정
              </button>
              <button
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("댓글을 삭제할까요?"))
                    remove.mutate(comment.id);
                }}
              >
                삭제
              </button>
            </div>
          )}
        </>
      )}
      {(error || update.error || remove.error) && (
        <p role="alert">
          {error || update.error?.message || remove.error?.message}
        </p>
      )}
    </article>
  );
};

export const Comments = ({ postId }: { postId: number }) => {
  const query = useComments(postId);
  const add = useAddComment(postId);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    add.reset();
    if (!content.trim()) {
      setError("댓글을 입력해 주세요.");
      return;
    }
    add.mutate(content.trim(), { onSuccess: () => setContent("") });
  };

  return (
    <section aria-label="댓글" className={styles.cards}>
      <h2>댓글</h2>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">댓글을 불러오고 있어요.</p>}
      {query.data?.map((comment) => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          댓글 내용
          <textarea
            required
            maxLength={300}
            value={content}
            disabled={add.isPending}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <button disabled={add.isPending}>댓글 달기</button>
        {(error || add.error) && (
          <p role="alert">{error || add.error?.message}</p>
        )}
      </form>
    </section>
  );
};
