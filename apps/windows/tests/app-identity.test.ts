// @vitest-environment node
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appUserModelId,
  PRODUCTION_APP_USER_MODEL_ID,
  resolveAppIconPath,
} from "../src/shared/app-identity";

describe("Windows application identity", () => {
  it("uses the registered product identity in production and development", () => {
    expect(appUserModelId(true)).toBe(PRODUCTION_APP_USER_MODEL_ID);
    expect(appUserModelId(false)).toBe(PRODUCTION_APP_USER_MODEL_ID);
  });

  it("uses the packaged extra resource and development product icon", () => {
    expect(
      resolveAppIconPath({
        isPackaged: true,
        resourcesPath: "C:\\Program Files\\Zhixu\\resources",
        workingDirectory: "D:\\Code\\Projects\\apps\\zhixu\\apps\\windows",
      }),
    ).toBe(join("C:\\Program Files\\Zhixu\\resources", "zhixu.ico"));
    expect(
      resolveAppIconPath({
        isPackaged: false,
        resourcesPath: "unused",
        workingDirectory: "D:\\Code\\Projects\\apps\\zhixu\\apps\\windows",
      }),
    ).toBe(
      resolve(
        "D:\\Code\\Projects\\apps\\zhixu\\apps\\windows",
        "resources/zhixu.ico",
      ),
    );
  });

  it("applies the product name and icon to the development window and tray", () => {
    const main = readFileSync(
      new URL("../src/main/index.ts", import.meta.url),
      "utf8",
    );
    expect(main).toContain('app.setName("知序")');
    expect(main).toContain(
      "app.setAppUserModelId(appUserModelId(app.isPackaged))",
    );
    expect(main).toContain("mainWindow.setIcon(icon)");
    expect(main).toContain("tray = new Tray(icon)");
  });
});
