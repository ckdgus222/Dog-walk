import { describe, expect, it } from "vitest";
import { readDogFields } from "./dog-fields";

describe("Dog form fields", () => {
  it("builds the dog payload without account or photo fields", () => {
    const form = new FormData();
    form.set("name", "보리");
    form.set("breed", "믹스");
    form.set("size", "SMALL");
    form.set("gender", "FEMALE");
    form.set("neutered", "on");
    form.set("birthYear", "1990");
    form.set("personality", "산책을 좋아해요.");
    form.set("email", "owner@example.com");
    form.set("nickname", "보호자");
    form.set("photo", new Blob(["photo"], { type: "image/webp" }), "dog.webp");

    expect(readDogFields(form)).toEqual({
      name: "보리",
      breed: "믹스",
      size: "SMALL",
      gender: "FEMALE",
      neutered: true,
      birthYear: 1990,
      personality: "산책을 좋아해요.",
    });
  });

  it("sends false when the neutered checkbox is unchecked", () => {
    const form = new FormData();
    expect(readDogFields(form).neutered).toBe(false);
  });
});
