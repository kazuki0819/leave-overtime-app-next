"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { reasonSchema } from "@/lib/validations/leave-usage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { LeaveUsage } from "@/lib/schema";

interface VoidLeaveUsageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: LeaveUsage | null;
  employeeId: string;
  currentRemainingDays: number;
}

export function VoidLeaveUsageDialog({
  open,
  onOpenChange,
  usage,
  employeeId,
  currentRemainingDays,
}: VoidLeaveUsageDialogProps) {
  const { toast } = useToast();
  const [voidedReason, setVoidedReason] = useState("");
  const [fieldError, setFieldError] = useState<string>();

  const resetForm = () => {
    setVoidedReason("");
    setFieldError(undefined);
  };

  const afterRemainingDays = usage
    ? currentRemainingDays + usage.days
    : currentRemainingDays;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!usage) throw new Error("解除対象が選択されていません");
      const res = await apiRequest("POST", `/api/leave-usages/${usage.id}/void`, {
        voided_reason: voidedReason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves/all", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "レコードを解除しました" });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const result = reasonSchema.safeParse(voidedReason);
    if (!result.success) {
      setFieldError(result.error.issues[0].message);
      return;
    }
    setFieldError(undefined);
    mutation.mutate();
  };

  if (!usage) return null;

  const isAdjustment = usage.recordType === "adjustment";
  const isIncrease = isAdjustment && usage.days < 0;
  const typeLabel = isAdjustment
    ? isIncrease ? "補正（増）" : "補正（減）"
    : "取得";
  const daysDisplay = isAdjustment
    ? `${usage.days < 0 ? "+" : "−"}${Math.abs(usage.days).toFixed(1)}日`
    : `${usage.days.toFixed(1)}日`;
  const displayDate = usage.recordDate || usage.startDate;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[480px] p-0 gap-0 overflow-hidden rounded-[10px] border-[var(--pr4-border)]">
        {/* Header — red danger style */}
        <DialogHeader className="px-6 pt-[18px] pb-4 bg-[var(--red-soft)] border-b border-[var(--red)]/15">
          <DialogTitle className="text-base font-semibold text-[var(--red)] flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[var(--red)] text-[var(--surface)] inline-flex items-center justify-center text-[13px] font-bold shrink-0">
              !
            </span>
            レコードを解除
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--ink-50)] mt-1">
            解除すると残日数の計算から除外されます。履歴自体は監査追跡のため保持されます。
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-[22px] space-y-4">
          {/* 解除対象プレビュー */}
          <div className="bg-[var(--surface-2)] border border-[var(--pr4-border)] rounded-md p-3.5">
            <p className="text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider mb-2">
              解除対象
            </p>
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
              <span className="font-mono text-xs font-medium text-[var(--ink)]">
                {displayDate}
              </span>
              <div>
                <p className="text-xs font-semibold text-[var(--ink)] mb-0.5">
                  {typeLabel}
                </p>
                <p className="text-xs text-[var(--ink-70)]">
                  {usage.reason || "理由なし"}
                </p>
              </div>
              <span
                className={`text-sm font-semibold tracking-tight ${
                  isIncrease ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                {daysDisplay}
              </span>
            </div>
          </div>

          {/* 解除理由入力 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              解除理由 <span className="text-[var(--red)] font-semibold">必須</span>
              <span className="font-normal text-[var(--ink-50)] text-[11px]">
                — なぜ解除するかを記録します
              </span>
            </label>
            <Textarea
              value={voidedReason}
              onChange={(e) => {
                setVoidedReason(e.target.value);
                if (fieldError) setFieldError(undefined);
              }}
              placeholder="例: 4月分の正規消化日が判明したため、補正値を解除"
              className="min-h-[76px] text-[13px] border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
            />
            {fieldError && (
              <p className="text-xs text-[var(--red)] mt-1.5">{fieldError}</p>
            )}
            <p className="text-[11px] text-[var(--ink-50)] mt-1.5">
              解除後、この理由は履歴として残ります。
              <span className="tabular-nums ml-1">{voidedReason.length}/200</span>
            </p>
          </div>

          {/* 警告ボックス */}
          <div className="flex gap-2.5 items-start bg-[var(--amber-soft)] border border-[var(--amber)]/18 rounded-md px-3.5 py-2.5">
            <span className="w-[18px] h-[18px] rounded-full bg-[var(--amber)] text-white inline-flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
              !
            </span>
            <p className="text-xs leading-relaxed text-[var(--amber)] font-medium">
              解除すると、この{isAdjustment ? "補正値" : "取得履歴"}が残日数の計算から除外されます。レコード自体は履歴に「解除済」として残ります。
            </p>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3.5 bg-[var(--surface-2)] border-t border-[var(--pr4-border)] flex items-center justify-between sm:justify-between">
          <p className="text-[11px] text-[var(--ink-50)]">
            解除後の残日数:{" "}
            <strong className="text-[var(--ink)] font-mono">
              {currentRemainingDays.toFixed(1)} → {afterRemainingDays.toFixed(1)}日
            </strong>
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="bg-[var(--red)] hover:bg-[var(--red)]/90"
            >
              {mutation.isPending ? "解除中..." : "解除する"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
