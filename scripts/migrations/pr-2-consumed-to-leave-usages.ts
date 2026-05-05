/**
 * PR-2 マイグレーションスクリプト
 *
 * 既存の paid_leaves.consumed_days / manual_baseline_* を
 * leave_usages の補正値レコード (record_type='adjustment') に変換する。
 *
 * Usage:
 *   npx tsx scripts/migrations/pr-2-consumed-to-leave-usages.ts --dry-run
 *   npx tsx scripts/migrations/pr-2-consumed-to-leave-usages.ts
 *   npx tsx scripts/migrations/pr-2-consumed-to-leave-usages.ts --rollback
 */

import { createClient } from "@libsql/client";
import { calcLeaveDeadline } from "../../lib/leave-calc";
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
  console.log(`[PR-2] ${msg}`);
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addOneDayStr(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return formatDateStr(d);
}

// ── record_date: joinDate → currentGrantDate + 1日 ──
function calcRecordDate(joinDate: string): string {
  const deadline = calcLeaveDeadline(joinDate, 0, new Date());
  if (!deadline.currentGrantDate) {
    throw new Error(`grant date を算出できません (joinDate=${joinDate})`);
  }
  return addOneDayStr(deadline.currentGrantDate);
}

// ── pr2_migration_log テーブル作成 ──
async function ensureMigrationLogTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS pr2_migration_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paid_leave_id INTEGER NOT NULL,
      before_consumed_days REAL,
      before_manual_baseline_remaining REAL,
      before_manual_baseline_date TEXT,
      before_manual_baseline_note TEXT,
      created_leave_usage_ids TEXT,
      migrated_at TEXT NOT NULL
    )
  `);
}

// ── マイグレーション ──
async function migrate() {
  log(isDryRun ? "=== ドライラン開始 ===" : "=== マイグレーション開始 ===");
  log(`対象DB: ${url}`);

  await ensureMigrationLogTable();

  const existingLog = await client.execute("SELECT COUNT(*) as cnt FROM pr2_migration_log");
  if ((existingLog.rows[0].cnt as number) > 0 && !isDryRun) {
    log("ERROR: pr2_migration_log に既にレコードがあります。ロールバック後に再実行してください。");
    process.exit(1);
  }

  const targets = await client.execute(`
    SELECT pl.id, pl.employee_id, pl.granted_days, pl.carried_over_days,
           pl.consumed_days, pl.remaining_days, pl.expired_days,
           pl.manual_baseline_remaining, pl.manual_baseline_date, pl.manual_baseline_note,
           e.join_date
    FROM paid_leaves pl
    JOIN employees e ON pl.employee_id = e.id
    WHERE pl.consumed_days > 0 OR pl.manual_baseline_remaining IS NOT NULL
    ORDER BY pl.id
  `);

  log(`移行対象: ${targets.rows.length} 件`);

  const now = new Date().toISOString();
  let convertedCount = 0;
  let skippedMbCount = 0;

  for (const row of targets.rows) {
    const plId = row.id as number;
    const employeeId = row.employee_id as string;
    const grantedDays = row.granted_days as number;
    const carriedOverDays = row.carried_over_days as number;
    const consumedDays = row.consumed_days as number;
    const expiredDays = row.expired_days as number;
    const mbRemaining = row.manual_baseline_remaining as number | null;
    const mbDate = row.manual_baseline_date as string | null;
    const mbNote = row.manual_baseline_note as string | null;
    const joinDate = row.join_date as string;

    let recordDate: string;
    try {
      recordDate = calcRecordDate(joinDate);
    } catch (e) {
      log(`  ERROR: pl.id=${plId} (employee=${employeeId}) - ${e}`);
      continue;
    }

    log(`\n--- pl.id=${plId} employee=${employeeId} ---`);
    log(`  joinDate=${joinDate}, recordDate=${recordDate}`);

    const createdUsageIds: number[] = [];
    let needsReset = false;

    // ── 1. consumed_days > 0 → 補正値レコード ──
    if (consumedDays > 0) {
      log(`  [consumed_days] ${consumedDays} → adjustment レコード`);

      if (!isDryRun) {
        const result = await client.execute({
          sql: `INSERT INTO leave_usages
                (employee_id, start_date, end_date, paid_leave_id, record_date, days,
                 note, record_type, reason, is_voided, voided_at, voided_reason, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'adjustment', ?, 0, NULL, NULL, ?, ?)`,
          args: [
            employeeId, recordDate, recordDate, plId, recordDate,
            consumedDays,
            "PR-2 マイグレーション (consumed_days 由来)",
            "マイグレーション初期値",
            now, now,
          ],
        });
        createdUsageIds.push(Number(result.lastInsertRowid));
        log(`    → leave_usages.id=${createdUsageIds[createdUsageIds.length - 1]}`);
      }
      needsReset = true;
      convertedCount++;
    }

    // ── 2. manual_baseline_* → 差分計算 ──
    if (mbRemaining !== null && mbRemaining !== undefined) {
      const autoRemaining = Math.max(0, grantedDays + carriedOverDays - consumedDays - expiredDays);
      const diff = autoRemaining - mbRemaining;

      log(`  [manual_baseline] remaining=${mbRemaining}, autoRemaining=${autoRemaining}, diff=${diff}`);

      if (diff === 0) {
        log(`    → 差分ゼロ: スキップ`);
        skippedMbCount++;
      } else {
        const mbRecordDate = mbDate || recordDate;
        const mbReason = (mbNote ? mbNote + " " : "") + "(PR-2 マイグレーション)";

        log(`    → diff=${diff} の補正値レコード (recordDate=${mbRecordDate})`);

        if (!isDryRun) {
          const result = await client.execute({
            sql: `INSERT INTO leave_usages
                  (employee_id, start_date, end_date, paid_leave_id, record_date, days,
                   note, record_type, reason, is_voided, voided_at, voided_reason, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'adjustment', ?, 0, NULL, NULL, ?, ?)`,
            args: [
              employeeId, mbRecordDate, mbRecordDate, plId, mbRecordDate,
              diff,
              "PR-2 マイグレーション (manual_baseline_* 由来)",
              mbReason,
              now, now,
            ],
          });
          createdUsageIds.push(Number(result.lastInsertRowid));
          log(`    → leave_usages.id=${createdUsageIds[createdUsageIds.length - 1]}`);
        }
        needsReset = true;
        convertedCount++;
      }
    }

    // ── 3. migration_log 記録 + paid_leaves リセット ──
    if (!isDryRun) {
      // migration_log は全対象レコードに記録（スキップ含む）
      await client.execute({
        sql: `INSERT INTO pr2_migration_log
              (paid_leave_id, before_consumed_days, before_manual_baseline_remaining,
               before_manual_baseline_date, before_manual_baseline_note, created_leave_usage_ids, migrated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          plId, consumedDays, mbRemaining, mbDate, mbNote,
          createdUsageIds.length > 0
            ? JSON.stringify(createdUsageIds)
            : JSON.stringify({ skipped: "zero difference", usageIds: [] }),
          now,
        ],
      });

      // consumed_days → 0（consumed > 0 の場合のみ）
      if (consumedDays > 0) {
        await client.execute({
          sql: "UPDATE paid_leaves SET consumed_days = 0 WHERE id = ?",
          args: [plId],
        });
      }

      // manual_baseline_* → NULL（差分ゼロでも必ずクリア: 書き込み停止のため）
      if (mbRemaining !== null) {
        await client.execute({
          sql: `UPDATE paid_leaves SET
                  manual_baseline_remaining = NULL,
                  manual_baseline_date = NULL,
                  manual_baseline_note = NULL
                WHERE id = ?`,
          args: [plId],
        });
      }
    }
  }

  log(`\n=== ${isDryRun ? "ドライラン" : "マイグレーション"}完了 ===`);
  log(`変換: ${convertedCount} 件, manual_baseline スキップ: ${skippedMbCount} 件`);

  if (!isDryRun) {
    // consumed_days を leave_usages から派生値として再計算（アラート等で参照されるため）
    log("\n--- consumed_days 派生値再計算 ---");
    await client.execute(`
      UPDATE paid_leaves SET consumed_days = (
        SELECT COALESCE(SUM(days), 0) FROM leave_usages
        WHERE paid_leave_id = paid_leaves.id AND is_voided = 0
      )
      WHERE id IN (SELECT paid_leave_id FROM pr2_migration_log)
    `);
    log("  完了");

    await verifyIntegrity();
  }
}

// ── 整合性検証 ──
async function verifyIntegrity() {
  log("\n=== 整合性検証 ===");

  const logs = await client.execute("SELECT * FROM pr2_migration_log ORDER BY id");
  let allPass = true;

  for (const logRow of logs.rows) {
    const plId = logRow.paid_leave_id as number;
    const beforeConsumed = logRow.before_consumed_days as number;
    const usageIdsRaw = logRow.created_leave_usage_ids as string;

    let parsedIds: number[];
    try {
      const parsed = JSON.parse(usageIdsRaw);
      if (parsed.skipped) {
        log(`  pl.id=${plId}: スキップ (${parsed.skipped}) ✓`);
        continue;
      }
      parsedIds = parsed as number[];
    } catch {
      parsedIds = [];
    }

    // consumed_days が leave_usages から派生値として正しく再計算されたか
    const plResult = await client.execute({
      sql: "SELECT consumed_days FROM paid_leaves WHERE id = ?",
      args: [plId],
    });
    const currentConsumed = plResult.rows[0]?.consumed_days as number;

    // leave_usages の合計が元の consumed_days と一致するか
    // (consumed_days 由来の adjustment のみ。manual_baseline 由来は別途)
    const usagesResult = await client.execute({
      sql: `SELECT SUM(days) as total FROM leave_usages
            WHERE paid_leave_id = ? AND is_voided = 0 AND record_type = 'adjustment'
              AND note = 'PR-2 マイグレーション (consumed_days 由来)'`,
      args: [plId],
    });
    const consumedAdjTotal = (usagesResult.rows[0]?.total as number) || 0;

    if (beforeConsumed > 0 && Math.abs(consumedAdjTotal - beforeConsumed) > 0.001) {
      log(`  FAIL pl.id=${plId}: consumed adjustment=${consumedAdjTotal} != before=${beforeConsumed}`);
      allPass = false;
    } else if (beforeConsumed > 0 && Math.abs(currentConsumed - beforeConsumed) > 0.001) {
      log(`  FAIL pl.id=${plId}: derived consumed_days=${currentConsumed} != before=${beforeConsumed}`);
      allPass = false;
    } else {
      log(`  pl.id=${plId}: consumed_days ${beforeConsumed} → adjustment ${consumedAdjTotal}, derived=${currentConsumed} ✓`);
    }
  }

  // leave_usages 全体の件数確認
  const totalUsages = await client.execute(
    "SELECT COUNT(*) as cnt FROM leave_usages WHERE record_type = 'adjustment'"
  );
  log(`\n  leave_usages (adjustment) 総数: ${totalUsages.rows[0].cnt}`);

  // manual_baseline がクリアされたか
  const mbCheck = await client.execute(
    "SELECT COUNT(*) as cnt FROM paid_leaves WHERE manual_baseline_remaining IS NOT NULL"
  );
  log(`  manual_baseline_remaining 残存: ${mbCheck.rows[0].cnt} 件`);

  if (allPass) {
    log("\n✓ 整合性検証: 全件パス");
  } else {
    log("\n✗ 整合性検証: 失敗あり（上記を確認してください）");
  }
}

// ── ロールバック ──
async function rollback() {
  log("=== ロールバック開始 ===");
  log(`対象DB: ${url}`);

  const tableCheck = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pr2_migration_log'"
  );
  if (tableCheck.rows.length === 0) {
    log("pr2_migration_log テーブルが存在しません。ロールバック不要です。");
    return;
  }

  const logs = await client.execute("SELECT * FROM pr2_migration_log ORDER BY id");
  if (logs.rows.length === 0) {
    log("pr2_migration_log にレコードがありません。ロールバック不要です。");
    return;
  }

  log(`ロールバック対象: ${logs.rows.length} 件`);

  for (const logRow of logs.rows) {
    const plId = logRow.paid_leave_id as number;
    const beforeConsumed = logRow.before_consumed_days as number;
    const beforeMbRemaining = logRow.before_manual_baseline_remaining as number | null;
    const beforeMbDate = logRow.before_manual_baseline_date as string | null;
    const beforeMbNote = logRow.before_manual_baseline_note as string | null;
    const usageIdsRaw = logRow.created_leave_usage_ids as string;

    // leave_usages 削除
    let usageIds: number[] = [];
    try {
      const parsed = JSON.parse(usageIdsRaw);
      usageIds = parsed.skipped ? (parsed.usageIds || []) : (parsed as number[]);
    } catch { /* empty */ }

    for (const uid of usageIds) {
      await client.execute({ sql: "DELETE FROM leave_usages WHERE id = ?", args: [uid] });
    }

    // paid_leaves 復元
    await client.execute({
      sql: "UPDATE paid_leaves SET consumed_days = ? WHERE id = ?",
      args: [beforeConsumed, plId],
    });

    if (beforeMbRemaining !== null) {
      await client.execute({
        sql: `UPDATE paid_leaves SET
                manual_baseline_remaining = ?,
                manual_baseline_date = ?,
                manual_baseline_note = ?
              WHERE id = ?`,
        args: [beforeMbRemaining, beforeMbDate, beforeMbNote, plId],
      });
    }

    log(`  pl.id=${plId}: 復元完了 (consumed=${beforeConsumed}, mb=${beforeMbRemaining ?? "NULL"})`);
  }

  await client.execute("DELETE FROM pr2_migration_log");
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
