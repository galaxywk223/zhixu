import { join, resolve } from "node:path";

export const PRODUCTION_APP_USER_MODEL_ID = "com.galaxywk.zhixu.desktop";

export function appUserModelId(_isPackaged: boolean): string {
  return PRODUCTION_APP_USER_MODEL_ID;
}

export function resolveAppIconPath(options: {
  isPackaged: boolean;
  resourcesPath: string;
  workingDirectory: string;
}): string {
  return options.isPackaged
    ? join(options.resourcesPath, "zhixu.ico")
    : resolve(options.workingDirectory, "resources/zhixu.ico");
}
