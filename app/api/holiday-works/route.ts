import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const employeeId = request.nextUrl.searchParams.get("employeeId");
  const data = await storage.getHolidayWorks(employeeId ?? undefined);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const result = await storage.createHolidayWork(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ message: "休日出勤の登録に失敗しました", error: String(e) }, { status: 400 });
  }
}
