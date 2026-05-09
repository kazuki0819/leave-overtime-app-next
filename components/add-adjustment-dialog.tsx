"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { adjustmentDaysSchema, reasonSchema } from "@/lib/validations/leave-usage";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

type AdjustmentType = "increase" | "decrease";

interface AddAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paidLeaveId: number;
  employeeId: string;
  employeeName: string;
}

export function AddAdjustmentDialog({
  open,
  onOpenChange,
  paidLeaveId,
  employeeId,
  employeeName,
}: AddAdjustmentDialogProps) {
  const { toast } = useToast();
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("increase");
  const [daysInput, setDaysInput] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ days?: string; reason?: string }>({});

  const resetForm = () => {
    setAdjustmentType("increase");
    setDaysInput("");
    setReason("");
    setFieldErrors({});
  };

  const validate = (): boolean => {
    const errors: { days?: string; reason?: string } = {};
    const daysNum = parseFloat(daysInput);

    if (daysInput.trim() === "" || isNaN(daysNum)) {
      errors.days = "日数を入力してください";
    } else {
      const absValue = Math.abs(daysNum);
      const signedValue = adjustmentType === "increase" ? -absValue : absValue;
      const result = adjustmentDaysSchema.safeParse(signedValue);
      if (!result.success) {
        errors.days = result.error.issues[0].message;
      }
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
      const absValue = Math.abs(parseFloat(daysInput));
      const days = adjustmentType === "increase" ? -absValue : absValue;
      const today = new Date().toISOString().split("T")[0];
      const res = await apiRequest("POST", "/api/leave-adjustments", {
        paidLeaveId,
        recordDate: today,
        days,
        reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      toast({ title: "補正値を追加しました" });
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[480px] p-0 gap-0 overflow-hidden rounded-[10px] border-[var(--pr4-border)]">
        {/* Header */}
        <DialogHeader className="px-6 pt-[18px] pb-4 border-b border-[var(--pr4-border)]">
          <DialogTitle className="text-base font-semibold text-[var(--ink)]">
            補正値を追加
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--ink-50)] mt-1">
            {employeeName} さんの現在のサイクルに補正値を追加します
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-[22px] space-y-[18px]">
          {/* 種別選択 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              種別 <span className="text-[var(--red)] font-semibold">必須</span>
              <span className="font-normal text-[var(--ink-50)] text-[11px]">
                — 残日数を増やすか減らすかを選択してください
              </span>
            </label>
            <RadioGroup
              value={adjustmentType}
              onValueChange={(v) => setAdjustmentType(v as AdjustmentType)}
              className="grid grid-cols-2 gap-2"
            >
              <label
                className={`relative flex flex-col cursor-pointer rounded-md border-[1.5px] p-3 transition-all ${
                  adjustmentType === "increase"
                    ? "border-[var(--ink)] bg-[var(--surface-2)]"
                    : "border-[var(--pr4-border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RadioGroupItem value="increase" className="sr-only" />
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                      adjustmentType === "increase"
                        ? "border-[var(--ink)] bg-[var(--ink)]"
                        : "border-[var(--ink-35)]"
                    }`}
                  >
                    {adjustmentType === "increase" && (
                      <div className="w-[5px] h-[5px] rounded-full bg-[var(--surface)]" />
                    )}
                  </div>
                  <span className="text-[13px] font-semibold text-[var(--green)]">
                    残を増やす
                  </span>
                </div>
                <span className="text-[11px] text-[var(--ink-50)] pl-[22px] leading-snug">
                  権利を加算する方向（過去消化未報告等）
                </span>
              </label>

              <label
                className={`relative flex flex-col cursor-pointer rounded-md border-[1.5px] p-3 transition-all ${
                  adjustmentType === "decrease"
                    ? "border-[var(--ink)] bg-[var(--surface-2)]"
                    : "border-[var(--pr4-border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <RadioGroupItem value="decrease" className="sr-only" />
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                      adjustmentType === "decrease"
                        ? "border-[var(--ink)] bg-[var(--ink)]"
                        : "border-[var(--ink-35)]"
                    }`}
                  >
                    {adjustmentType === "decrease" && (
                      <div className="w-[5px] h-[5px] rounded-full bg-[var(--surface)]" />
                    )}
                  </div>
                  <span className="text-[13px] font-semibold text-[var(--red)]">
                    残を減らす
                  </span>
                </div>
                <span className="text-[11px] text-[var(--ink-50)] pl-[22px] leading-snug">
                  消化扱いの方向（特別休暇扱い等）
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* 日数入力 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              日数 <span className="text-[var(--red)] font-semibold">必須</span>
              <span className="font-normal text-[var(--ink-50)] text-[11px]">
                — 0.125日刻み（例: 0.125, 0.25, 0.5, 1.0...）
              </span>
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={daysInput}
              onChange={(e) => {
                setDaysInput(e.target.value);
                if (fieldErrors.days) setFieldErrors((prev) => ({ ...prev, days: undefined }));
              }}
              placeholder="0.0"
              className="max-w-[160px] font-mono text-sm border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
            />
            {fieldErrors.days && (
              <p className="text-xs text-[var(--red)] mt-1.5">{fieldErrors.days}</p>
            )}
            <p className="text-[11px] text-[var(--ink-50)] mt-1.5">
              小数第3位までの精度で入力できます。最大99.999日まで。
            </p>
          </div>

          {/* 理由入力 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              理由 <span className="text-[var(--red)] font-semibold">必須</span>
              <span className="font-normal text-[var(--ink-50)] text-[11px]">
                — 監査追跡のため記録されます
              </span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (fieldErrors.reason) setFieldErrors((prev) => ({ ...prev, reason: undefined }));
              }}
              placeholder="例: 配属先報告: 4月分の取得日確認中消化日として加算"
              className="min-h-[76px] text-[13px] border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
            />
            {fieldErrors.reason && (
              <p className="text-xs text-[var(--red)] mt-1.5">{fieldErrors.reason}</p>
            )}
            <p className="text-[11px] text-[var(--ink-50)] mt-1.5">
              業務的背景を簡潔に記録してください（200文字まで）。
              <span className="tabular-nums ml-1">{reason.length}/200</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3.5 bg-[var(--surface-2)] border-t border-[var(--pr4-border)] flex items-center justify-between sm:justify-between">
          <p className="text-[11px] text-[var(--ink-50)]">
            入力後、現在のサイクルに即時反映されます
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
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="bg-[var(--ink)] text-[var(--surface)] hover:bg-[var(--ink-90)]"
            >
              {mutation.isPending ? "追加中..." : "補正値を追加"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
