import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { recordDateSchema, reasonSchema } from "@/lib/validations/leave-usage";
import { z } from "zod";

const confirmDateRequestSchema = z.object({
  leaveUsageId: z.number().int().positive(),
  recordDate: recordDateSchema,
  reason: reasonSchema,
});

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = confirmDateRequestSchema.parse(body);
    const result = await storage.confirmLeaveAdjustmentDate({
      leaveUsageId: data.leaveUsageId,
      recordDate: data.recordDate,
      reason: data.reason,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { message: "入力データが不正です", errors: e.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "サーバーエラーが発生しました" },
      { status: 400 },
    );
  }
}
