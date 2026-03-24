import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const { overtimes } = body;
    let imported = 0;
    let skipped = 0;
    const skippedReasons: string[] = [];
    if (overtimes && Array.isArray(overtimes)) {
      for (const ot of overtimes) {
        if (!ot.employeeId || ot.employeeId.toString().trim() === "") {
          skipped++;
          skippedReasons.push(`月${ot.month || "?"}: 社員IDなし`);
          continue;
        }
        if (!ot.month || ot.month < 1 || ot.month > 12) {
          skipped++;
          skippedReasons.push(`社員${ot.employeeId}: 月が不正 (${ot.month})`);
          continue;
        }
        await storage.upsertMonthlyOvertime(ot);
        imported++;
      }
    }
    return NextResponse.json({ importedOvertimes: imported, skipped, skippedReasons });
  } catch (e) {
    return NextResponse.json({ message: "残業データのインポートに失敗しました", error: String(e) }, { status: 400 });
  }
}
