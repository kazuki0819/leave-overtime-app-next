import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

// GET /api/assignment-histories/:employeeId — list histories for an employee
export async function GET(_request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  const histories = await storage.getAssignmentHistories(params.employeeId);
  return NextResponse.json(histories);
}

// PATCH /api/assignment-histories/:id — update a history record by numeric id
export async function PATCH(request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  const id = parseInt(params.employeeId, 10);
  if (isNaN(id)) return NextResponse.json({ message: "無効なIDです" }, { status: 400 });
  const body = await request.json();
  const history = await storage.updateAssignmentHistory(id, body);
  if (!history) return NextResponse.json({ message: "配属履歴が見つかりません" }, { status: 404 });
  return NextResponse.json(history);
}

// DELETE /api/assignment-histories/:id — delete a history record by numeric id
export async function DELETE(_request: NextRequest, { params }: { params: { employeeId: string } }) {
  await ensureDbInitialized();
  const id = parseInt(params.employeeId, 10);
  if (isNaN(id)) return NextResponse.json({ message: "無効なIDです" }, { status: 400 });
  const ok = await storage.deleteAssignmentHistory(id);
  if (!ok) return NextResponse.json({ message: "配属履歴が見つかりません" }, { status: 404 });
  return NextResponse.json({ success: true });
}
