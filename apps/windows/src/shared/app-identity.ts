import { join, resolve } from "node:path";

export const PRODUCTION_APP_USER_MODEL_ID = "com.galaxywk.zhixu.desktop";
export const DEVELOPMENT_APP_USER_MODEL_ID = "com.galaxywk.zhixu.desktop.dev";

export function appUserModelId(isPackaged: boolean): string {
  return isPackaged
    ? PRODUCTION_APP_USER_MODEL_ID
    : DEVELOPMENT_APP_USER_MODEL_ID;
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
