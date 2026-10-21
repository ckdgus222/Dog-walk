"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatHistory, useSendChatMessage } from "../../../lib/api/chat";
import { AuthGate } from "../../_components/auth-gate";
import { useAuth } from "../../_components/auth-provider";
import { useNotifications } from "../../_components/notifications-provider";
import shared from "../../_components/shared.module.css";
import styles from "./chat.module.css";

const ChatPage = () => {
  return (
    <main className={shared.main}>
      <AuthGate>
        <Suspense fallback={<p role="status">메시지를 불러오고 있어요.</p>}>
          <ChatRoute />
        </Suspense>
      </AuthGate>
      <Link href="/walk-requests">산책 요청 보기</Link>
    </main>
  );
};
export default ChatPage;

const ChatRoute = () => {
  const { id } = useParams<{ id: string }>();
  const walkRequestId = Number(id);
  if (
    !/^\d+$/.test(id) ||
    !Number.isSafeInteger(walkRequestId) ||
    walkRequestId <= 0
  )
    return <p role="alert">산책 요청을 찾을 수 없어요.</p>;
  return <ChatRoom key={walkRequestId} walkRequestId={walkRequestId} />;
};

const ChatRoom = ({ walkRequestId }: { walkRequestId: number }) => {
  const { user } = useAuth();
  const { socket } = useNotifications();
  const queryClient = useQueryClient();
  const history = useChatHistory(walkRequestId);
  const send = useSendChatMessage(socket, walkRequestId);
  const [content, setContent] = useState("");
  const [connected, setConnected] = useState(socket?.connected ?? false);
  const submitting = useRef(false);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!socket) return;
    const onConnect = async () => {
      setConnected(true);
      const queryKey = ["chat", walkRequestId];
      await queryClient.cancelQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey });
    };
    const onDisconnect = () => setConnected(false);
    // A shared socket may already be connected when this screen subscribes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnected(socket.connected);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket, queryClient, walkRequestId]);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [history.data?.messages]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      submitting.current ||
      send.isPending ||
      !socket?.connected ||
      !content.trim()
    )
      return;
    submitting.current = true;
    try {
      await send.mutateAsync(content);
      setContent("");
    } catch {
      // The mutation error is shown below, and the draft stays unchanged.
    } finally {
      submitting.current = false;
    }
  };

  if (history.isError) return <p role="alert">{history.error.message}</p>;
  if (!history.data) return <p role="status">메시지를 불러오고 있어요.</p>;

  return (
    <>
      <h1>{history.data.counterpart.nickname}님과의 채팅</h1>
      <p>최근 50개 메시지만 보여요.</p>
      <ol ref={list} aria-label="채팅 메시지" className={styles.messages}>
        {history.data.messages.slice(-50).map((message) => (
          <li
            key={message.id}
            className={
              message.senderId === user?.id ? styles.mine : styles.theirs
            }
          >
            <strong>
              {message.senderId === user?.id ? "나" : message.senderNickname}
            </strong>
            <p>{message.content}</p>
            <time dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleString("ko-KR")}
            </time>
          </li>
        ))}
      </ol>
      <form className={shared.form} onSubmit={submit}>
        <label>
          메시지
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.nativeEvent.isComposing)
                event.preventDefault();
            }}
            maxLength={500}
            disabled={send.isPending}
            required
          />
        </label>
        <button
          type="submit"
          disabled={
            send.isPending ||
            !connected ||
            !socket?.connected ||
            !content.trim()
          }
        >
          보내기
        </button>
        {(!connected || !socket?.connected) && (
          <p role="status">연결하고 있어요.</p>
        )}
        {send.error && <p role="alert">{send.error.message}</p>}
      </form>
    </>
  );
};
