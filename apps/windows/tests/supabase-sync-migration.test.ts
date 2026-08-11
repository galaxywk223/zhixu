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
const fixMigration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/202608100008_fix_sync_apply_operation.sql",
  ),
  "utf8",
);
const financeMigration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/202608110009_finance_transactions.sql",
  ),
  "utf8",
);
const quoteMigration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/202608110010_daily_quotes.sql",
  ),
  "utf8",
);
const quoteFunction = readFileSync(
  resolve(__dirname, "../../../supabase/functions/daily-quote/index.ts"),
  "utf8",
);
const syncService = readFileSync(
  resolve(__dirname, "../src/main/services/sync.ts"),
  "utf8",
);
const ipc = readFileSync(resolve(__dirname, "../src/main/ipc.ts"), "utf8");
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

  it("uses an unambiguous target table variable in the corrective RPC", () => {
    expect(fixMigration).toContain("target_table_name text");
    expect(fixMigration).toContain("from information_schema.columns c");
    expect(fixMigration).toContain("c.table_name = target_table_name");
    expect(fixMigration).not.toContain("zhixu_apply_operation.table_name");
    expect(fixMigration).toContain(
      "revoke all on function public.zhixu_apply_operation(jsonb) from public",
    );
  });

  it("adds finance transactions to RLS, revisions, snapshots, and push mapping", () => {
    expect(financeMigration).toContain(
      "create table if not exists public.finance_transactions",
    );
    expect(financeMigration).toContain("unique(user_id, platform, source_key)");
    expect(financeMigration).toContain(
      "create policy finance_transactions_owner_policy",
    );
    expect(financeMigration).toContain(
      "when 'finance_transaction' then 'finance_transactions'",
    );
    expect(financeMigration).toContain("'finance_transaction', coalesce");
    expect(contract).toContain('"finance_transaction"');
  });

  it("adds protected daily quotes without exposing the model key", () => {
    expect(quoteMigration).toContain(
      "create table if not exists public.daily_quotes",
    );
    expect(quoteMigration).toContain("create policy daily_quotes_owner_policy");
    expect(quoteMigration).toContain("'daily_quote'");
    expect(quoteMigration).toContain(
      "public.zhixu_apply_operation_v9(operation)",
    );
    expect(quoteMigration).toContain("public.sync_snapshot_v9()");
    expect(contract).toContain('"daily_quote"');
    expect(quoteFunction).toContain('Deno.env.get("DEEPSEEK_API_KEY")');
    expect(quoteFunction).toContain("supabase.auth.getUser(token)");
    expect(quoteFunction).not.toContain("sb_publishable_");
  });

  it("catches background failures while preserving manual sync errors", () => {
    expect(syncService).toContain(
      "void this.run(reason).catch(() => undefined)",
    );
    expect(syncService).not.toMatch(
      /void this\.run\("(?:periodic|online|local-change|login|retry)"\)/,
    );
    expect(ipc).toContain('dependencies.sync.run("manual")');
  });
});
