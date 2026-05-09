import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { voidLeaveUsageSchema } from "@/lib/validations/leave-usage";
import { z } from "zod";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = voidLeaveUsageSchema.parse(body);
    const leaveUsageId = parseInt(params.id, 10);
    if (isNaN(leaveUsageId)) {
      return NextResponse.json({ message: "無効なIDです" }, { status: 400 });
    }
    const result = await storage.voidLeaveUsage({
      leaveUsageId,
      voidedReason: data.voided_reason,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { message: "入力データが不正です", errors: e.issues },
        { status: 400 },
      );
    }
    const status = e instanceof Error && e.message.includes("見つかりません") ? 404 : 400;
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "サーバーエラーが発生しました" },
      { status },
    );
  }
}
