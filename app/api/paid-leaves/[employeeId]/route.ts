import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : 2025;
  const leave = await storage.getPaidLeaveByEmployee(params.employeeId, year);
  return NextResponse.json(leave || null);
}
