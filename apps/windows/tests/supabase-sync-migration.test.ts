// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/202608100007_account_sync.sql",
  ),
  "utf8",
);
const contract = readFileSync(
  resolve(
    __dirname,
    "../../../shared/contracts/schemas/sync-operation.schema.json",
  ),
  "utf8",
);

describe("Supabase sync migration", () => {
  it("adds countdowns to the revision protocol and protected snapshot", () => {
    expect(migration).toContain("create table if not exists public.countdowns");
    expect(migration).toContain("when 'countdowns' then 'countdown'");
    expect(migration).toContain(
      "create or replace function public.sync_snapshot()",
    );
    expect(migration).toContain(
      "grant execute on function public.sync_snapshot() to authenticated",
    );
    expect(contract).toContain('"countdown"');
  });

  it("preserves note conflicts and exposes explicit resolution", () => {
    expect(migration).toContain(
      "entity_kind = 'note' and current_rev > base_rev",
    );
    expect(migration).toContain("'applied', false");
    expect(migration).toContain(
      "create or replace function public.resolve_note_conflict",
    );
    expect(migration).toContain(
      "resolution not in ('local', 'remote', 'both')",
    );
  });

  it("keeps snapshots and upserts scoped to the authenticated owner", () => {
    expect(migration).toContain("where t.user_id = auth.uid()");
    expect(migration).toContain(
      "where %1$I.user_id = excluded.user_id returning server_revision",
    );
    expect(migration).toContain(
      "revoke all on function public.push_operations(jsonb) from public",
    );
  });
});
