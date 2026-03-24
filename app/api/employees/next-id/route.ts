import { NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET() {
  await ensureDbInitialized();
  const nextId = await storage.getNextEmployeeId();
  return NextResponse.json({ nextId });
}
