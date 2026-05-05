import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertPaidLeaveSchema } from "@/lib/schema";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const leaves = await storage.getPaidLeaves(year);
  return NextResponse.json(leaves);
}

export async function PUT(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = insertPaidLeaveSchema.parse(body);

    const granted = data.grantedDays ?? 0;
    const carriedOver = data.carriedOverDays ?? 0;
    const expired = data.expiredDays ?? 0;

    data.remainingDays = Math.max(0, granted + carriedOver - expired);
    data.usageRate = 0;

    const leave = await storage.upsertPaidLeave(data);
    const updated = await storage.getPaidLeaveByEmployee(data.employeeId, data.fiscalYear);

    return NextResponse.json(updated ?? leave);
  } catch (e) {
    return NextResponse.json({ message: "入力データが不正です", error: String(e) }, { status: 400 });
  }
}
