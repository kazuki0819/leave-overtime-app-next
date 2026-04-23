import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { recalcConsumedDays } from "@/lib/recalc-consumed";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const usages = await storage.getLeaveUsages();
  const target = usages.find(u => u.id === parseInt(params.id, 10));
  const ok = await storage.deleteLeaveUsage(parseInt(params.id, 10));
  if (!ok) return NextResponse.json({ message: "データが見つかりません" }, { status: 404 });
  if (target) await recalcConsumedDays(target.employeeId);
  return NextResponse.json({ success: true });
}
