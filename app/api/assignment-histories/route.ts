import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertAssignmentHistorySchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = insertAssignmentHistorySchema.parse(body) as any as any;
    const history = await storage.createAssignmentHistory(data);
    return NextResponse.json(history, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: "入力データが不正です", error: String(e) }, { status: 400 });
  }
}
