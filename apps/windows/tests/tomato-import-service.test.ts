// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { TomatoImportService } from "../src/main/services/tomato-import";
import type { ZhixuStore } from "../src/main/store";
import type { TomatoPreview } from "../src/preload/api-types";

vi.mock("electron", () => ({
  dialog: { showOpenDialog: vi.fn() },
}));

describe("Tomato import preview lifetime", () => {
  it("retains a preview token after a failed commit and removes it after success", () => {
    let attempts = 0;
    const store = {
      importTomato: () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
        return {
          importedCount: 1,
          updatedCount: 0,
          skippedCount: 0,
          focusImportedCount: 1,
          lifeEventImportedCount: 0,
          reconciledCount: 0,
          excludedCount: 0,
          errorCount: 0,
        };
      },
    } as unknown as ZhixuStore;
    const service = new TomatoImportService(store, "", "", false);
    const preview = {
      token: "retry-token",
      rows: [],
    } as unknown as TomatoPreview;
    const pending = (
      service as unknown as { pending: Map<string, TomatoPreview> }
    ).pending;
    pending.set(preview.token, preview);

    expect(() => service.confirm(preview.token)).toThrow("temporary failure");
    expect(pending.has(preview.token)).toBe(true);
    expect(service.confirm(preview.token).importedCount).toBe(1);
    expect(pending.has(preview.token)).toBe(false);
  });
});
