import { describe, expect, it } from "vitest";
import { mergeMessages } from "./chat";
import type { ChatMessage } from "../types";

const message = (
  id: number,
  createdAt = "2026-10-21T12:00:00.000Z",
): ChatMessage => ({
  id,
  walkRequestId: 1,
  senderId: 2,
  senderNickname: "산책 친구",
  content: `메시지 ${id}`,
  createdAt,
});

describe("mergeMessages", () => {
  it("keeps each id once across history and repeated socket messages", () => {
    const first = message(1);
    const second = message(2);
    expect(mergeMessages([first, first], [second, first, second])).toEqual([
      first,
      second,
    ]);
  });

  it("sorts by creation time, then by numeric id for matching times", () => {
    const earlier = message(20, "2026-10-21T11:59:59.999Z");
    const first = message(2);
    const second = message(10);
    const later = message(1, "2026-10-21T12:00:00.001Z");
    expect(mergeMessages([later, second], [first, earlier])).toEqual([
      earlier,
      first,
      second,
      later,
    ]);
  });

  it("does not reorder or append to the input arrays", () => {
    const current = [message(3), message(1)];
    const incoming = [message(2)];
    mergeMessages(current, incoming);
    expect(current.map(({ id }) => id)).toEqual([3, 1]);
    expect(incoming.map(({ id }) => id)).toEqual([2]);
  });

  it("handles an empty history or no incoming messages", () => {
    expect(mergeMessages([], [])).toEqual([]);
    expect(mergeMessages([], [message(1)])).toEqual([message(1)]);
    expect(mergeMessages([message(1)], [])).toEqual([message(1)]);
  });
});
