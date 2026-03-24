import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const id = parseInt(params.id, 10);
  const body = await request.json();
  const history = await storage.updateAssignmentHistory(id, body);
  if (!history) return NextResponse.json({ message: "配属履歴が見つかりません" }, { status: 404 });
  return NextResponse.json(history);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const ok = await storage.deleteAssignmentHistory(parseInt(params.id, 10));
  if (!ok) return NextResponse.json({ message: "配属履歴が見つかりません" }, { status: 404 });
  return NextResponse.json({ success: true });
}
