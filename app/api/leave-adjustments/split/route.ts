import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { adjustmentDaysSchema, reasonSchema } from "@/lib/validations/leave-usage";
import { z } from "zod";

const splitRequestSchema = z.object({
  leaveUsageId: z.number().int().positive(),
  splits: z
    .array(
      z.object({
        recordDate: z.string().min(1, "日付は必須です"),
        days: adjustmentDaysSchema,
      }),
    )
    .min(2, "分割先は2件以上必要です"),
  reason: reasonSchema,
});

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = splitRequestSchema.parse(body);
    const results = await storage.splitLeaveAdjustment({
      leaveUsageId: data.leaveUsageId,
      splits: data.splits,
      reason: data.reason,
    });
    return NextResponse.json(results, { status: 201 });
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
