import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "../lib/db";
import { leaveUsages } from "../lib/schema";
import { regeneratePaidLeaves } from "../lib/paid-leave-calc";

interface CsvRow {
  employeeId: string;
  recordDate: string;
  days: number;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const header = lines[0];
  if (header !== "employee_id,record_date,days") {
    throw new Error(`CSVヘッダーが不正: ${header}`);
  }
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [empId, recordDate, daysStr] = line.split(",");
    const days = parseFloat(daysStr);
    if (!empId || !recordDate || isNaN(days) || days <= 0) {
      throw new Error(`CSV ${i + 1}行目が不正: ${line}`);
    }
    rows.push({ employeeId: empId, recordDate, days });
  }
  return rows;
}

async function main() {
  const csvPath = resolve(__dirname, "../bulk_usage_import.csv");
  const targetEmployeeId = process.argv[2] || null;
  const now = new Date().toISOString();

  console.log("=== 消化データ一括投入スクリプト ===");
  console.log(`接続先: ${process.env.TURSO_DATABASE_URL}`);
  console.log(`CSVファイル: ${csvPath}`);
  console.log(`対象絞込: ${targetEmployeeId ? `社員ID=${targetEmployeeId}` : "全件"}`);
  console.log("");

  const allRows = parseCsv(csvPath);
  const rows = targetEmployeeId
    ? allRows.filter((r) => r.employeeId === targetEmployeeId)
    : allRows;

  if (rows.length === 0) {
    console.log("投入対象が0件です。終了します。");
    if (targetEmployeeId) {
      console.log(`CSVに employee_id=${targetEmployeeId} の行が見つかりません。`);
    }
    process.exit(0);
  }

  const uniqueIds = Array.from(new Set(rows.map((r) => r.employeeId)));
  console.log(`投入対象: ${uniqueIds.length}社員、${rows.length}件`);
  console.log(`社員ID: ${uniqueIds.join(", ")}`);
  console.log("");

  // INSERT（トランザクション）
  console.log("=== INSERT 開始 ===");
  const startInsert = Date.now();
  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.insert(leaveUsages).values({
          employeeId: row.employeeId,
          startDate: row.recordDate,
          endDate: row.recordDate,
          recordDate: row.recordDate,
          days: row.days,
          paidLeaveId: 0,
          recordType: "usage",
          isVoided: 0,
          note: "Excel一括移行",
          reason: "",
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  } catch (err) {
    console.error("INSERT失敗（ロールバック済み）:", err);
    process.exit(1);
  }
  const insertMs = Date.now() - startInsert;
  console.log(`INSERT完了: ${rows.length}件 (${(insertMs / 1000).toFixed(1)}秒)`);
  console.log("");

  // 再計算
  console.log("=== 有給サイクル再計算 開始 ===");
  const startRecalc = Date.now();
  const results = await regeneratePaidLeaves(uniqueIds);
  const recalcMs = Date.now() - startRecalc;

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  for (const r of results) {
    console.log(`  ${r.success ? "OK" : "NG"}: ${r.employeeId}${r.error ? ` — ${r.error}` : ""}`);
  }
  console.log("");

  console.log("=== サマリ ===");
  console.log(`INSERT: ${rows.length}件`);
  console.log(`再計算: 成功${succeeded.length} / 失敗${failed.length} / 合計${results.length}`);
  console.log(`所要時間: INSERT ${(insertMs / 1000).toFixed(1)}秒 + 再計算 ${(recalcMs / 1000).toFixed(1)}秒`);

  if (failed.length > 0) {
    console.log("");
    console.log("=== 失敗一覧 ===");
    for (const r of failed) {
      console.log(`  ${r.employeeId}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});
