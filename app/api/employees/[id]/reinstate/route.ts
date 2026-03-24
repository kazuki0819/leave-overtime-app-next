import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const emp = await storage.reinstateEmployee(params.id);
  if (!emp) return NextResponse.json({ message: "社員が見つかりません" }, { status: 404 });
  return NextResponse.json(emp);
}
