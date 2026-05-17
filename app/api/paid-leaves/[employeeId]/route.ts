import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { ensurePaidLeavesUpToDate } from "@/lib/paid-leave-calc";

export async function GET(request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  await ensurePaidLeavesUpToDate(params.employeeId, new Date());
  const leave = await storage.getPaidLeaveByEmployee(params.employeeId);
  return NextResponse.json(leave || null);
}
