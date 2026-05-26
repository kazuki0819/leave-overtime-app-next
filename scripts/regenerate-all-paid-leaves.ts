import { regeneratePaidLeaves } from "../lib/paid-leave-calc";

async function main() {
  const args = process.argv.slice(2);
  const employeeIds = args.length > 0 ? args : undefined;

  console.log(`接続先: ${process.env.TURSO_DATABASE_URL}`);
  console.log(`対象: ${employeeIds ? `指定社員 ${employeeIds.length}名 (${employeeIds.join(", ")})` : "全社員"}`);
  console.log("");

  const startTime = Date.now();
  const results = await regeneratePaidLeaves(employeeIds);
  const durationMs = Date.now() - startTime;

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  for (const r of results) {
    if (r.success) {
      console.log(`  OK: ${r.employeeId}`);
    } else {
      console.log(`  NG: ${r.employeeId} — ${r.error}`);
    }
  }

  console.log("");
  console.log("=== サマリ ===");
  console.log(`成功: ${succeeded.length} / 失敗: ${failed.length} / 合計: ${results.length}`);
  console.log(`所要時間: ${(durationMs / 1000).toFixed(1)}秒`);

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
