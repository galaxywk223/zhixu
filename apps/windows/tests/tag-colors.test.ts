import { describe, expect, it } from "vitest";
import {
  normalizeTagName,
  TAG_TONES,
  tagColorHex,
  tagTone,
} from "../src/shared/tag-colors";

describe("automatic tag colors", () => {
  it("normalizes names before selecting a stable tone", () => {
    expect(normalizeTagName("  ＡI  ")).toBe("ai");
    expect(tagTone(" 算法 ")).toBe(tagTone("算法"));
    expect(tagTone("算法")).toBe("cyan");
    expect(tagTone("保研")).toBe("amber");
  });

  it("maps every name to a supported tone and compatibility color", () => {
    for (const name of ["算法", "保研", "学习", "项目", "阅读", "复盘"]) {
      expect(TAG_TONES).toContain(tagTone(name));
      expect(tagColorHex(name)).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(tagColorHex("算法")).toBe("#2389A4");
  });
});
