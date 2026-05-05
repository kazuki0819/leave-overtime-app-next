/**
 * PR-3 マイグレーションスクリプト
 *
 * paid_leaves テーブルから fiscal_year カラムを物理削除する。
 * 実行前の全データを pr3_migration_log に JSON 保存し、ロールバック可能。
 *
 * Usage:
 *   npx tsx scripts/migrations/pr-3-fiscal-year-removal.ts --dry-run
 *   npx tsx scripts/migrations/pr-3-fiscal-year-removal.ts
 *   npx tsx scripts/migrations/pr-3-fiscal-year-removal.ts --rollback
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── CLI引数 ──
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isRollback = args.includes("--rollback");

// ── .env.local を手動読み込み ──
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(resolve(filePath), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch { /* ignore missing file */ }
}

loadEnvFile(".env.local");

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("ERROR: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が未設定です");
  process.exit(1);
}
if (url.includes("leave-overtime-prod")) {
  console.error("ERROR: 本番DBへの接続が検出されました。処理を中断します。");
  process.exit(1);
}

const client = createClient({ url, authToken });

function log(msg: string) {
  console.log(`[PR-3] ${msg}`);
}

// ── pr3_migration_log テーブル作成 ──
async function ensureMigrationLogTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS pr3_migration_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      executed_at TEXT NOT NULL,
      before_data_json TEXT NOT NULL,
      dropped_column TEXT NOT NULL
    )
  `);
}

// ── fiscal_year カラムの存在確認 ──
async function hasFiscalYearColumn(): Promise<boolean> {
  const result = await client.execute("PRAGMA table_info(paid_leaves)");
  return result.rows.some((row) => row.name === "fiscal_year");
}

// ── paid_leaves 全データ取得 ──
async function snapshotPaidLeaves(): Promise<string> {
  const result = await client.execute("SELECT * FROM paid_leaves ORDER BY id");
  const rows = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of result.columns) {
      obj[col] = row[col];
    }
    return obj;
  });
  return JSON.stringify(rows, null, 2);
}

// ── マイグレーション ──
async function migrate() {
  log(isDryRun ? "=== ドライラン開始 ===" : "=== マイグレーション開始 ===");
  log(`対象DB: ${url}`);

  const hasFY = await hasFiscalYearColumn();
  if (!hasFY) {
    log("fiscal_year カラムは既に存在しません。マイグレーション不要です。");
    return;
  }

  await ensureMigrationLogTable();

  // 二重実行防止
  const existingLog = await client.execute("SELECT COUNT(*) as cnt FROM pr3_migration_log");
  if ((existingLog.rows[0].cnt as number) > 0 && !isDryRun) {
    log("ERROR: pr3_migration_log に既にレコードがあります。ロールバック後に再実行してください。");
    process.exit(1);
  }

  // 現在のデータスナップショット
  const beforeJson = await snapshotPaidLeaves();
  const rowCount = JSON.parse(beforeJson).length;
  log(`paid_leaves レコード数: ${rowCount}`);

  // fiscal_year 分布
  const dist = await client.execute(
    "SELECT fiscal_year, COUNT(*) as cnt FROM paid_leaves GROUP BY fiscal_year ORDER BY fiscal_year"
  );
  for (const row of dist.rows) {
    log(`  fiscal_year=${row.fiscal_year}: ${row.cnt}件`);
  }

  if (isDryRun) {
    log("\n--- ドライラン: 以下の操作を実行予定 ---");
    log("1. pr3_migration_log に実行前データ(JSON)を保存");
    log("2. ALTER TABLE paid_leaves DROP COLUMN fiscal_year");
    log(`   対象: ${rowCount}件のレコード`);
    log("\n=== ドライラン完了 ===");
    return;
  }

  // 実行前データを保存
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO pr3_migration_log (executed_at, before_data_json, dropped_column)
          VALUES (?, ?, ?)`,
    args: [now, beforeJson, "fiscal_year"],
  });
  log("pr3_migration_log にバックアップデータを保存しました");

  // DROP COLUMN 実行
  log("ALTER TABLE paid_leaves DROP COLUMN fiscal_year を実行中...");
  await client.execute("ALTER TABLE paid_leaves DROP COLUMN fiscal_year");
  log("fiscal_year カラムを削除しました");

  await verifyMigration();

  log("\n=== マイグレーション完了 ===");
}

// ── 整合性検証 ──
async function verifyMigration() {
  log("\n=== 整合性検証 ===");

  // fiscal_year カラムが消えていること
  const hasFY = await hasFiscalYearColumn();
  if (hasFY) {
    log("FAIL: fiscal_year カラムがまだ存在します");
    return;
  }
  log("✓ fiscal_year カラム削除確認");

  // レコード数が変わっていないこと
  const logData = await client.execute(
    "SELECT before_data_json FROM pr3_migration_log ORDER BY id DESC LIMIT 1"
  );
  const beforeRows = JSON.parse(logData.rows[0].before_data_json as string);
  const afterCount = await client.execute("SELECT COUNT(*) as cnt FROM paid_leaves");
  const afterCnt = afterCount.rows[0].cnt as number;

  if (beforeRows.length !== afterCnt) {
    log(`FAIL: レコード数不一致 (before=${beforeRows.length}, after=${afterCnt})`);
    return;
  }
  log(`✓ レコード数一致: ${afterCnt}件`);

  // 各レコードの主要カラムが保持されていること（サンプル5件）
  const sample = await client.execute("SELECT id, employee_id, granted_days, remaining_days FROM paid_leaves LIMIT 5");
  for (const row of sample.rows) {
    const beforeRow = beforeRows.find((r: Record<string, unknown>) => r.id === row.id);
    if (!beforeRow) {
      log(`FAIL: id=${row.id} がバックアップに見つかりません`);
      return;
    }
    if (beforeRow.employee_id !== row.employee_id ||
        beforeRow.granted_days !== row.granted_days ||
        beforeRow.remaining_days !== row.remaining_days) {
      log(`FAIL: id=${row.id} のデータが変わっています`);
      return;
    }
  }
  log("✓ サンプルデータ整合性確認");

  // テーブルスキーマの確認
  const schema = await client.execute("SELECT sql FROM sqlite_master WHERE name='paid_leaves'");
  const ddl = schema.rows[0]?.sql as string;
  if (ddl.includes("fiscal_year")) {
    log("FAIL: テーブル定義に fiscal_year が残っています");
    return;
  }
  log("✓ テーブル定義から fiscal_year が除去されていることを確認");

  log("\n✓ 整合性検証: 全件パス");
}

// ── ロールバック ──
async function rollback() {
  log("=== ロールバック開始 ===");
  log(`対象DB: ${url}`);

  const tableCheck = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pr3_migration_log'"
  );
  if (tableCheck.rows.length === 0) {
    log("pr3_migration_log テーブルが存在しません。ロールバック不要です。");
    return;
  }

  const logs = await client.execute("SELECT * FROM pr3_migration_log ORDER BY id DESC LIMIT 1");
  if (logs.rows.length === 0) {
    log("pr3_migration_log にレコードがありません。ロールバック不要です。");
    return;
  }

  const logRow = logs.rows[0];
  const beforeRows = JSON.parse(logRow.before_data_json as string) as Record<string, unknown>[];
  log(`復元対象: ${beforeRows.length}件のレコード`);
  log(`元の実行日時: ${logRow.executed_at}`);

  // fiscal_year カラムがまだ存在するか確認
  const hasFY = await hasFiscalYearColumn();
  if (hasFY) {
    log("fiscal_year カラムは既に存在します。データの復元のみ実施します。");
  } else {
    // fiscal_year カラムを再追加
    log("fiscal_year カラムを再追加中...");
    await client.execute("ALTER TABLE paid_leaves ADD COLUMN fiscal_year INTEGER NOT NULL DEFAULT 2025");
    log("fiscal_year カラムを追加しました");
  }

  // 各レコードの fiscal_year を復元
  let restoredCount = 0;
  for (const row of beforeRows) {
    const fiscalYear = row.fiscal_year as number;
    const id = row.id as number;
    await client.execute({
      sql: "UPDATE paid_leaves SET fiscal_year = ? WHERE id = ?",
      args: [fiscalYear, id],
    });
    restoredCount++;
  }
  log(`fiscal_year を ${restoredCount}件復元しました`);

  // ロールバック検証
  const dist = await client.execute(
    "SELECT fiscal_year, COUNT(*) as cnt FROM paid_leaves GROUP BY fiscal_year ORDER BY fiscal_year"
  );
  log("\n復元後の fiscal_year 分布:");
  for (const row of dist.rows) {
    log(`  fiscal_year=${row.fiscal_year}: ${row.cnt}件`);
  }

  // ログレコード削除
  await client.execute("DELETE FROM pr3_migration_log");
  log("\npr3_migration_log をクリアしました");

  log("\n=== ロールバック完了 ===");
}

// ── エントリポイント ──
async function main() {
  try {
    if (isRollback) {
      await rollback();
    } else {
      await migrate();
    }
  } catch (err) {
    log(`FATAL ERROR: ${err}`);
    process.exit(1);
  }
}

main();
