import { describe, expect, it } from "vitest";
import { wordRangeAt } from "./textSelection";

describe("wordRangeAt", () => {
  it("selects a word under the caret without including surrounding punctuation", () => {
    expect(wordRangeAt("Olá, mundo!", 7)).toEqual({ start: 5, end: 10 });
    expect(wordRangeAt("Olá, mundo!", 2)).toEqual({ start: 0, end: 3 });
  });

  it("clamps the caret and leaves whitespace collapsed", () => {
    expect(wordRangeAt("", 5)).toEqual({ start: 0, end: 0 });
    expect(wordRangeAt("um dois", 2)).toEqual({ start: 2, end: 2 });
    expect(wordRangeAt("um dois", 3)).toEqual({ start: 3, end: 7 });
  });
});
