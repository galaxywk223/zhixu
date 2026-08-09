import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ZhixuApi } from "./api-types";

function subscription<T>(
  channel: string,
  listener: (value: T) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void =>
    listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: ZhixuApi = {
  app: {
    bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
    onDataChanged: (listener) => subscription("app:data-changed", listener),
    onNavigate: (listener) => subscription("app:navigate", listener),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  tasks: {
    list: () => ipcRenderer.invoke("tasks:list"),
    save: (draft) => ipcRenderer.invoke("tasks:save", draft),
    createBatch: (draft) => ipcRenderer.invoke("tasks:create-batch", draft),
    setStatus: (id, status) =>
      ipcRenderer.invoke("tasks:set-status", { id, status }),
    remove: (id) => ipcRenderer.invoke("tasks:remove", id),
    categories: () => ipcRenderer.invoke("tasks:categories"),
    tags: () => ipcRenderer.invoke("tasks:tags"),
    saveTag: (input) => ipcRenderer.invoke("tasks:save-tag", input),
    removeTag: (id) => ipcRenderer.invoke("tasks:remove-tag", id),
  },
  memos: {
    list: () => ipcRenderer.invoke("memos:list"),
    save: (draft) => ipcRenderer.invoke("memos:save", draft),
    remove: (id) => ipcRenderer.invoke("memos:remove", id),
  },
  calendar: {
    list: (startAt, endAt) =>
      ipcRenderer.invoke("calendar:list", { startAt, endAt }),
    save: (draft) => ipcRenderer.invoke("calendar:save", draft),
    remove: (id) => ipcRenderer.invoke("calendar:remove", id),
  },
  notes: {
    list: () => ipcRenderer.invoke("notes:list"),
    save: (draft) => ipcRenderer.invoke("notes:save", draft),
    remove: (id) => ipcRenderer.invoke("notes:remove", id),
  },
  focus: {
    list: () => ipcRenderer.invoke("focus:list"),
    batches: () => ipcRenderer.invoke("focus:batches"),
    preview: () => ipcRenderer.invoke("focus:preview"),
    previewDropped: (file) =>
      ipcRenderer.invoke("focus:preview-path", webUtils.getPathForFile(file)),
    confirm: (token) => ipcRenderer.invoke("focus:confirm", token),
    rollback: (batchId) => ipcRenderer.invoke("focus:rollback", batchId),
  },
  sleep: {
    events: () => ipcRenderer.invoke("sleep:events"),
    save: (draft) => ipcRenderer.invoke("sleep:save", draft),
    remove: (id) => ipcRenderer.invoke("sleep:remove", id),
  },
  dashboard: { summary: () => ipcRenderer.invoke("dashboard:summary") },
  search: { query: (value) => ipcRenderer.invoke("search:query", value) },
  backup: {
    export: () => ipcRenderer.invoke("backup:export"),
    restore: () => ipcRenderer.invoke("backup:restore"),
    restoreDropped: (file) =>
      ipcRenderer.invoke("backup:restore-path", webUtils.getPathForFile(file)),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings) => ipcRenderer.invoke("settings:update", settings),
  },
  updates: {
    getState: () => ipcRenderer.invoke("updates:get-state"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install"),
    onState: (listener) => subscription("updates:state", listener),
  },
  sync: { getState: () => ipcRenderer.invoke("sync:get-state") },
};

contextBridge.exposeInMainWorld("zhixu", api);
