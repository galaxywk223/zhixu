// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) =>
      Buffer.from(`encrypted:${Buffer.from(value).toString("base64")}`),
    decryptString: (value: Buffer) =>
      Buffer.from(
        value.toString().slice("encrypted:".length),
        "base64",
      ).toString(),
  },
}));

import {
  EncryptedSessionStorage,
  loadDeviceId,
} from "../src/main/services/secure-storage";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("secure session storage", () => {
  it("persists a stable device id", () => {
    const root = mkdtempSync(join(tmpdir(), "zhixu-device-test-"));
    directories.push(root);
    const first = loadDeviceId(root);
    expect(loadDeviceId(root)).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("stores auth values only in encrypted form", async () => {
    const root = mkdtempSync(join(tmpdir(), "zhixu-auth-test-"));
    directories.push(root);
    const storage = new EncryptedSessionStorage(root);
    await storage.setItem("session", "secret-token");
    expect(await storage.getItem("session")).toBe("secret-token");
    expect(readFileSync(join(root, "auth-session.bin"), "utf8")).not.toContain(
      "secret-token",
    );
    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
  });
});
