import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const { retiredDate } = await request.json();
  if (!retiredDate) return NextResponse.json({ message: "退職日が必要です" }, { status: 400 });
  const existingEmp = await storage.getEmployee(params.id);
  if (!existingEmp) return NextResponse.json({ message: "社員が見つかりません" }, { status: 404 });
  if (existingEmp.joinDate && retiredDate < existingEmp.joinDate) {
    return NextResponse.json({ message: `退職日（${retiredDate}）は入社日（${existingEmp.joinDate}）より前に設定できません` }, { status: 400 });
  }
  const emp = await storage.retireEmployee(params.id, retiredDate);
  if (!emp) return NextResponse.json({ message: "社員が見つかりません" }, { status: 404 });
  return NextResponse.json(emp);
}
