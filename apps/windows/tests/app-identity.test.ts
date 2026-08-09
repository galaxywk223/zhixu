// @vitest-environment node
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appUserModelId,
  DEVELOPMENT_APP_USER_MODEL_ID,
  PRODUCTION_APP_USER_MODEL_ID,
  resolveAppIconPath,
} from "../src/shared/app-identity";

describe("Windows application identity", () => {
  it("keeps production and development taskbar identities separate", () => {
    expect(appUserModelId(true)).toBe(PRODUCTION_APP_USER_MODEL_ID);
    expect(appUserModelId(false)).toBe(DEVELOPMENT_APP_USER_MODEL_ID);
    expect(DEVELOPMENT_APP_USER_MODEL_ID).not.toBe(
      PRODUCTION_APP_USER_MODEL_ID,
    );
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
});
