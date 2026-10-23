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
import formStyles from "../_components/form.module.css";
import styles from "./posts.module.css";

// Mounted only while editing, so closing it drops the draft and any error.
const CommentEditForm = ({
  comment,
  onDone,
}: {
  comment: Comment;
  onDone: () => void;
}) => {
  const update = useUpdateComment(comment.postId);
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
      { onSuccess: onDone },
    );
  };

  return (
    <form
      className={`${formStyles.form} ${styles.commentEdit}`}
      onSubmit={handleSubmit}
    >
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
      <div className={styles.commentActions}>
        <button className={styles.primary} disabled={update.isPending}>
          저장
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={update.isPending}
          onClick={onDone}
        >
          취소
        </button>
      </div>
      {(error || update.error) && (
        <p role="alert">{error || update.error?.message}</p>
      )}
    </form>
  );
};

const CommentItem = ({ comment }: { comment: Comment }) => {
  const userId = useAuthStore((state) => state.user?.id);
  const remove = useDeleteComment(comment.postId);
  const [editing, setEditing] = useState(false);

  return (
    <article className={styles.comment}>
      <p className={styles.author}>{comment.author.nickname}</p>
      <time dateTime={comment.createdAt}>
        {new Date(comment.createdAt).toLocaleString("ko-KR")}
      </time>
      {editing ? (
        <CommentEditForm comment={comment} onDone={() => setEditing(false)} />
      ) : (
        <>
          <p className={styles.content}>{comment.content}</p>
          {userId === comment.author.id && (
            <div className={styles.commentActions}>
              <button
                className={styles.primary}
                disabled={remove.isPending}
                onClick={() => {
                  remove.reset();
                  setEditing(true);
                }}
              >
                수정
              </button>
              <button
                className={styles.secondary}
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
      {remove.error && <p role="alert">{remove.error.message}</p>}
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
    <section aria-label="댓글" className={styles.comments}>
      <h2>
        댓글 {query.data && <span>{query.data.length}</span>}
      </h2>
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.isPending && <p role="status">댓글을 불러오고 있어요.</p>}
      {query.data?.map((comment) => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
      <form className={styles.commentForm} onSubmit={handleSubmit}>
        <label>
          <span className={formStyles.visuallyHidden}>댓글 내용</span>
          <textarea
            placeholder="댓글을 입력해주세요. (최대 300자)"
            required
            maxLength={300}
            value={content}
            disabled={add.isPending}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <button className={formStyles.submit} disabled={add.isPending}>
          댓글 달기
        </button>
        {(error || add.error) && (
          <p role="alert">{error || add.error?.message}</p>
        )}
      </form>
    </section>
  );
};
