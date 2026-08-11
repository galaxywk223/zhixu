// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const appSource = source("../src/renderer/src/App.tsx");
const shellSource = source("../src/renderer/src/components/Shell.tsx");
const todaySource = source("../src/renderer/src/pages/TodayPage.tsx");
const searchSource = source("../src/renderer/src/components/SearchDialog.tsx");
const accountSource = source(
  "../src/renderer/src/components/AccountSyncPanel.tsx",
);
const preloadSource = source("../src/preload/index.ts");
const apiSource = source("../src/preload/api-types.ts");
const ipcSource = source("../src/main/ipc.ts");
const storeSource = source("../src/main/store.ts");
const databaseSource = source("../src/main/database.ts");
const syncSource = source("../src/main/services/sync-repository.ts");
const contractsSource = source("../../../shared/contracts/src/index.ts");
const packageSource = source("../package.json");
const initialSupabaseMigration = source(
  "../../../supabase/migrations/202608070001_initial_schema.sql",
);

describe("removed notes feature", () => {
  it("removes notes from every renderer entry point", () => {
    expect(appSource).not.toContain("NotesPage");
    expect(shellSource).not.toContain('id: "notes"');
    expect(todaySource).not.toContain("recent-notes");
    expect(searchSource).not.toContain('type === "note"');
    expect(searchSource).not.toContain("笔记");
    expect(accountSource).not.toContain("NoteConflict");
    expect(accountSource).not.toContain("笔记冲突");
  });

  it("removes note editing APIs and editor-only dependencies", () => {
    expect(preloadSource).not.toContain("notes:");
    expect(preloadSource).not.toContain("listNoteConflicts");
    expect(apiSource).not.toContain("NoteRecord");
    expect(apiSource).not.toContain("NoteConflict");
    expect(ipcSource).not.toContain('ipcMain.handle("notes:');
    expect(storeSource).not.toContain("listNotes(");
    expect(storeSource).not.toContain("saveNote(");
    expect(storeSource).not.toContain("removeNote(");
    expect(packageSource).not.toContain("react-markdown");
    expect(packageSource).not.toContain("remark-gfm");
  });

  it("keeps legacy storage and protocol definitions for compatibility", () => {
    expect(databaseSource).toContain("CREATE TABLE IF NOT EXISTS notes");
    expect(databaseSource).toContain(
      "CREATE TABLE IF NOT EXISTS note_versions",
    );
    expect(databaseSource).toContain(
      "CREATE TABLE IF NOT EXISTS note_conflicts",
    );
    expect(storeSource).toContain('"notes"');
    expect(storeSource).toContain('"note_versions"');
    expect(contractsSource).toMatch(/entityTypeSchema[\s\S]*"note"/);
    expect(initialSupabaseMigration).toContain("create table public.notes");
  });

  it("treats notes as remote-only compatibility data during sync", () => {
    expect(syncSource).toContain(
      'type RemoteEntityType = SyncEntityType | "note"',
    );
    expect(syncSource).toContain(
      'if (change.entity_type === "note") continue;',
    );
    expect(syncSource).toContain("entity_type <> 'note'");
    expect(syncSource).not.toContain('note: "notes"');
  });
});
