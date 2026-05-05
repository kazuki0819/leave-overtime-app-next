import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  const leave = await storage.getPaidLeaveByEmployee(params.employeeId);
  return NextResponse.json(leave || null);
}
