import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const employeeId = request.nextUrl.searchParams.get("employeeId");
  const data = await storage.getSpecialLeaves(employeeId ?? undefined);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const result = await storage.createSpecialLeave(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ message: "特別休暇の登録に失敗しました", error: String(e) }, { status: 400 });
  }
}
