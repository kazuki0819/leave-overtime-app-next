import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDbInitialized();
  try {
    await storage.deleteHolidayWork(parseInt(params.id));
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ message: "休日出勤の削除に失敗しました", error: String(e) }, { status: 400 });
  }
}
