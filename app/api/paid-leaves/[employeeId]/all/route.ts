import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { ensurePaidLeavesUpToDate } from "@/lib/paid-leave-calc";

export async function GET(request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  await ensurePaidLeavesUpToDate(params.employeeId, new Date());
  const cycles = await storage.getPaidLeavesByEmployee(params.employeeId);
  return NextResponse.json(cycles);
}
