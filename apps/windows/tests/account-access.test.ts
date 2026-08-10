import { describe, expect, it } from "vitest";
import { canUseBoundWorkspace } from "../src/shared/account-access";

describe("account workspace access", () => {
  it("allows only the authenticated account after binding completes", () => {
    expect(
      canUseBoundWorkspace("user-1", { userId: "user-1", state: "bound" }),
    ).toBe(true);
    expect(
      canUseBoundWorkspace("user-1", {
        userId: "user-1",
        state: "initializing",
      }),
    ).toBe(false);
    expect(
      canUseBoundWorkspace("user-2", { userId: "user-1", state: "bound" }),
    ).toBe(false);
    expect(
      canUseBoundWorkspace(null, { userId: "user-1", state: "bound" }),
    ).toBe(false);
    expect(canUseBoundWorkspace("user-1", null)).toBe(false);
  });
});
