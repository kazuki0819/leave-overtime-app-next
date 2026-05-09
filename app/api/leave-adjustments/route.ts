import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { adjustmentDaysSchema, recordDateSchema, reasonSchema } from "@/lib/validations/leave-usage";
import { z } from "zod";

const addAdjustmentRequestSchema = z.object({
  paidLeaveId: z.number().int().positive("有給情報IDは正の整数で指定してください"),
  recordDate: recordDateSchema,
  days: adjustmentDaysSchema,
  reason: reasonSchema,
  note: z.string().optional(),
});

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = addAdjustmentRequestSchema.parse(body);
    const usage = await storage.addLeaveAdjustment({
      paidLeaveId: data.paidLeaveId,
      recordDate: data.recordDate,
      days: data.days,
      reason: data.reason,
      note: data.note,
    });
    return NextResponse.json(usage, { status: 201 });
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
