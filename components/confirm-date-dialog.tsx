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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { LeaveUsage } from "@/lib/schema";

interface ConfirmDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LeaveUsage | null;
  employeeId: string;
}

export function ConfirmDateDialog({
  open,
  onOpenChange,
  target,
  employeeId,
}: ConfirmDateDialogProps) {
  const { toast } = useToast();
  const [recordDate, setRecordDate] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ date?: string; reason?: string }>({});

  const resetForm = () => {
    setRecordDate("");
    setReason("");
    setFieldErrors({});
  };

  const validate = (): boolean => {
    const errors: { date?: string; reason?: string } = {};

    if (!recordDate) {
      errors.date = "日付を入力してください";
    }

    const reasonResult = reasonSchema.safeParse(reason);
    if (!reasonResult.success) {
      errors.reason = reasonResult.error.issues[0].message;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("対象が未選択");
      const res = await apiRequest("POST", "/api/leave-adjustments/confirm-date", {
        leaveUsageId: target.id,
        recordDate,
        reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves/all", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "日付を確定しました" });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!validate()) return;
    mutation.mutate();
  };

  if (!target) return null;

  const isIncrease = target.days < 0;
  const displayDays = isIncrease
    ? `+${Math.abs(target.days).toFixed(1)}`
    : `−${Math.abs(target.days).toFixed(1)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[480px] p-0 gap-0 overflow-hidden rounded-[10px] border-[var(--pr4-border)]">
        <DialogHeader className="px-6 pt-[18px] pb-4 border-b border-[var(--pr4-border)]">
          <DialogTitle className="text-base font-semibold text-[var(--ink)]">日付を確定</DialogTitle>
          <DialogDescription className="text-xs text-[var(--ink-50)] mt-1">
            補正値レコードの日付を具体的な日付に変更します。
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-[22px] space-y-[18px]">
          {/* 対象レコード */}
          <div className="bg-[var(--surface-2)] border border-[var(--pr4-border)] rounded-md p-3">
            <div className="text-[10px] text-[var(--ink-50)] font-semibold uppercase tracking-wider mb-1.5">対象レコード</div>
            <div className="flex justify-between items-center">
              <div>
                <span className="font-mono text-xs text-[var(--ink)]">{target.recordDate || target.startDate}</span>
                <span className="mx-2 text-[var(--ink-35)]">·</span>
                <span className="text-xs text-[var(--ink-70)]">{target.reason || "-"}</span>
              </div>
              <span className={`text-sm font-semibold ${isIncrease ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                {displayDays}日
              </span>
            </div>
          </div>

          {/* 新しい日付 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              新しい日付 <span className="text-[var(--red)] font-semibold">必須</span>
            </label>
            <Input
              type="date"
              value={recordDate}
              onChange={(e) => {
                setRecordDate(e.target.value);
                if (fieldErrors.date) setFieldErrors((prev) => ({ ...prev, date: undefined }));
              }}
              className="max-w-[200px] text-sm font-mono border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
            />
            {fieldErrors.date && (
              <p className="text-xs text-[var(--red)] mt-1.5">{fieldErrors.date}</p>
            )}
          </div>

          {/* 理由 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              変更理由 <span className="text-[var(--red)] font-semibold">必須</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (fieldErrors.reason) setFieldErrors((prev) => ({ ...prev, reason: undefined }));
              }}
              placeholder="例: 取得日が4/15と判明したため日付を確定"
              className="min-h-[60px] text-[13px] border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
            />
            {fieldErrors.reason && (
              <p className="text-xs text-[var(--red)] mt-1.5">{fieldErrors.reason}</p>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3.5 bg-[var(--surface-2)] border-t border-[var(--pr4-border)] flex items-center justify-between sm:justify-between">
          <p className="text-[11px] text-[var(--ink-50)]">日付変更は履歴に記録されます</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { resetForm(); onOpenChange(false); }}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="bg-[var(--ink)] text-[var(--surface)] hover:bg-[var(--ink-90)]"
            >
              {mutation.isPending ? "確定中..." : "日付を確定"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
