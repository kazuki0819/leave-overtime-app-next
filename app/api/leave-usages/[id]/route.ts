import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const ok = await storage.deleteLeaveUsage(parseInt(params.id, 10));
  if (!ok) return NextResponse.json({ message: "データが見つかりません" }, { status: 404 });
  return NextResponse.json({ success: true });
}
