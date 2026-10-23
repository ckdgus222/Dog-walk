import { describe, expect, it } from "vitest";
import { personFaceIndex } from "./person-face";

describe("Person face", () => {
  it("gives each of the first eight users a different face", () => {
    const faces = [1, 2, 3, 4, 5, 6, 7, 8].map(personFaceIndex);
    expect(faces).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("starts over after the eighth face", () => {
    expect(personFaceIndex(9)).toBe(personFaceIndex(1));
    expect(personFaceIndex(16)).toBe(personFaceIndex(8));
  });
});
