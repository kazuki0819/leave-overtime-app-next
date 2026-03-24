import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertEmployeeSchema } from "@/lib/schema";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const includeRetired = request.nextUrl.searchParams.get("includeRetired") === "true";
  const employees = await storage.getEmployees(includeRetired);
  return NextResponse.json(employees);
}

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = insertEmployeeSchema.parse(body) as any;
    const emp = await storage.createEmployee(data);
    return NextResponse.json(emp, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: "入力データが不正です", error: String(e) }, { status: 400 });
  }
}
