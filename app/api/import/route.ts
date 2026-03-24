import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const { employees: emps, paidLeaves: leaves } = body;
    if (emps !== undefined && !Array.isArray(emps)) {
      return NextResponse.json({ message: "employeesフィールドは配列である必要があります" }, { status: 400 });
    }
    if (leaves !== undefined && !Array.isArray(leaves)) {
      return NextResponse.json({ message: "paidLeavesフィールドは配列である必要があります" }, { status: 400 });
    }
    let empResult = { added: 0, updated: 0, skipped: 0, skippedNames: [] as string[] };
    let leaveResult = { count: 0, skipped: 0 };
    if (emps && Array.isArray(emps)) {
      const validEmps: any[] = [];
      const validationErrors: string[] = [];
      for (let i = 0; i < emps.length; i++) {
        const e = emps[i];
        if (!e || typeof e !== "object") {
          validationErrors.push(`インデックス${i}: エントリが不正です`);
          continue;
        }
        if (!e.id && !e.name) {
          validationErrors.push(`インデックス${i}: idとnameが必要です`);
          continue;
        }
        validEmps.push(e);
      }
      if (validationErrors.length > 0) {
        return NextResponse.json({ message: "入力データに不正なエントリがあります", errors: validationErrors }, { status: 400 });
      }
      empResult = await storage.bulkImportEmployees(validEmps);
    }
    if (leaves && Array.isArray(leaves)) {
      leaveResult = await storage.bulkImportPaidLeaves(leaves);
    }
    return NextResponse.json({
      employees: {
        added: empResult.added,
        updated: empResult.updated,
        skipped: empResult.skipped,
        skippedNames: empResult.skippedNames,
      },
      paidLeaves: {
        imported: leaveResult.count,
        skipped: leaveResult.skipped,
      },
    });
  } catch (e) {
    return NextResponse.json({ message: "インポートに失敗しました", error: String(e) }, { status: 400 });
  }
}
