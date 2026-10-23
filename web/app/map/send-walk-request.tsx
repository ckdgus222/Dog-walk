"use client";

import Link from "next/link";
import { useState } from "react";
import { useSendWalkRequest } from "../../lib/api/walk-requests";
import formStyles from "../_components/form.module.css";
import styles from "./map.module.css";

export const SendWalkRequest = ({ receiverId }: { receiverId: number }) => {
  const request = useSendWalkRequest();
  const [message, setMessage] = useState("");

  const send = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    request.mutate(
      { receiverId, message },
      {
        onSuccess: () => setMessage(""),
      },
    );
  };

  return (
    <form className={`${formStyles.form} ${styles.request}`} onSubmit={send}>
      <label>
        <span>
          요청 메시지{" "}
          <span className={formStyles.optional}>(선택)</span>
        </span>
        <span
          className={styles.requestCount}
          aria-hidden="true"
          data-count={`${message.length} / 100`}
        />
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={100}
          placeholder="안녕하세요! 함께 산책하고 싶어요 :)"
        />
      </label>
      <button
        type="submit"
        className={formStyles.submit}
        disabled={request.isPending}
      >
        산책 요청 보내기
      </button>
      {request.isSuccess && <p role="status">산책 요청을 보냈어요.</p>}
      {request.error && (
        <p role="alert">
          {request.error.message}{" "}
          {request.error.code === "REVERSE_PENDING" && (
            <Link href="/walk-requests">받은 요청 보기</Link>
          )}
        </p>
      )}
    </form>
  );
};
