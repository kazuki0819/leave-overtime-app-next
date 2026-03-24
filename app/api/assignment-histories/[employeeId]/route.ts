import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(_request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  const histories = await storage.getAssignmentHistories(params.employeeId);
  return NextResponse.json(histories);
}
