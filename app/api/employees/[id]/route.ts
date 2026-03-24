import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const emp = await storage.getEmployee(params.id);
  if (!emp) return NextResponse.json({ message: "社員が見つかりません" }, { status: 404 });
  return NextResponse.json(emp);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const body = await request.json();
  const emp = await storage.updateEmployee(params.id, body);
  if (!emp) return NextResponse.json({ message: "社員が見つかりません" }, { status: 404 });
  return NextResponse.json(emp);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const ok = await storage.deleteEmployee(params.id);
  if (!ok) return NextResponse.json({ message: "社員が見つかりません" }, { status: 404 });
  return NextResponse.json({ success: true });
}
