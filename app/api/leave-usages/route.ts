import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertLeaveUsageSchema } from "@/lib/schema";
import { validateRecordDateInCycle } from "@/lib/validations/cycle-validation";
import { z } from "zod";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const employeeId = request.nextUrl.searchParams.get("employeeId") || undefined;
  const usages = await storage.getLeaveUsages(employeeId);
  return NextResponse.json(usages);
}

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = insertLeaveUsageSchema.parse(body);

    let paidLeaveId = data.paidLeaveId;

    // TODO: PR-8 完了後に除去 — paidLeaveId 未送信時は最新サイクルを自動選択
    if (!paidLeaveId) {
      const latestPl = await storage.getPaidLeaveByEmployee(data.employeeId);
      if (!latestPl) {
        return NextResponse.json(
          { message: "対象社員の有給情報が見つかりません" },
          { status: 400 },
        );
      }
      paidLeaveId = latestPl.id;
    }

    const recordDate = data.recordDate || data.startDate;
    await validateRecordDateInCycle(recordDate, paidLeaveId);

    const usage = await storage.createLeaveUsage({
      ...data,
      paidLeaveId,
      recordDate,
    });
    return NextResponse.json(usage, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { message: "入力データが不正です", errors: e.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "サーバーエラーが発生しました" },
      { status: 400 },
    );
  }
}
