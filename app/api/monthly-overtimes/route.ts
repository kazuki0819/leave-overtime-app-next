import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertMonthlyOvertimeSchema } from "@/lib/schema";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const employeeId = request.nextUrl.searchParams.get("employeeId") || undefined;
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const overtimes = await storage.getMonthlyOvertimes(employeeId, year);
  return NextResponse.json(overtimes);
}

export async function PUT(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = insertMonthlyOvertimeSchema.parse(body) as any;
    const ot = await storage.upsertMonthlyOvertime(data);
    return NextResponse.json(ot);
  } catch (e) {
    return NextResponse.json({ message: "入力データが不正です", error: String(e) }, { status: 400 });
  }
}
