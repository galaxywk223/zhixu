import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_SCALE,
  normalizeUiScale,
  stepUiScale,
} from "../src/shared/ui-scale";

describe("interface scale", () => {
  it("normalizes missing and unsupported values to 100 percent", () => {
    expect(normalizeUiScale(undefined)).toBe(DEFAULT_UI_SCALE);
    expect(normalizeUiScale(137)).toBe(DEFAULT_UI_SCALE);
    expect(normalizeUiScale("125")).toBe(DEFAULT_UI_SCALE);
    expect(normalizeUiScale(125)).toBe(125);
  });

  it("moves across the supported scale steps without crossing boundaries", () => {
    expect(stepUiScale(100, 1)).toBe(110);
    expect(stepUiScale(125, -1)).toBe(110);
    expect(stepUiScale(80, -1)).toBe(80);
    expect(stepUiScale(150, 1)).toBe(150);
  });
});
