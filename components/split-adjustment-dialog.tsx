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
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import type { LeaveUsage } from "@/lib/schema";

interface SplitRow {
  recordDate: string;
  days: string;
}

interface SplitAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LeaveUsage | null;
  employeeId: string;
}

export function SplitAdjustmentDialog({
  open,
  onOpenChange,
  target,
  employeeId,
}: SplitAdjustmentDialogProps) {
  const { toast } = useToast();
  const [splits, setSplits] = useState<SplitRow[]>([
    { recordDate: "", days: "" },
    { recordDate: "", days: "" },
  ]);
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ splits?: string; reason?: string; rows?: Record<number, string> }>({});

  const resetForm = () => {
    setSplits([
      { recordDate: "", days: "" },
      { recordDate: "", days: "" },
    ]);
    setReason("");
    setFieldErrors({});
  };

  const validate = (): boolean => {
    if (!target) return false;
    const errors: typeof fieldErrors = {};
    const rowErrors: Record<number, string> = {};

    for (let i = 0; i < splits.length; i++) {
      const row = splits[i];
      if (!row.recordDate) {
        rowErrors[i] = "日付を入力してください";
        continue;
      }
      const daysNum = parseFloat(row.days);
      if (row.days.trim() === "" || isNaN(daysNum)) {
        rowErrors[i] = "日数を入力してください";
        continue;
      }
      const result = adjustmentDaysSchema.safeParse(daysNum);
      if (!result.success) {
        rowErrors[i] = result.error.issues[0].message;
      }
    }

    if (Object.keys(rowErrors).length > 0) {
      errors.rows = rowErrors;
    }

    if (Object.keys(rowErrors).length === 0) {
      const total = splits.reduce((s, r) => s + (parseFloat(r.days) || 0), 0);
      if (Math.abs(total - target.days) > 0.001) {
        errors.splits = `分割後の合計（${total.toFixed(3)}）が元の値（${target.days.toFixed(3)}）と一致しません`;
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
      if (!target) throw new Error("対象が未選択");
      const res = await apiRequest("POST", "/api/leave-adjustments/split", {
        leaveUsageId: target.id,
        splits: splits.map((s) => ({
          recordDate: s.recordDate,
          days: parseFloat(s.days),
        })),
        reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      toast({ title: "補正値を分割しました" });
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

  const addRow = () => {
    setSplits((prev) => [...prev, { recordDate: "", days: "" }]);
  };

  const removeRow = (idx: number) => {
    if (splits.length <= 2) return;
    setSplits((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof SplitRow, value: string) => {
    setSplits((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    if (fieldErrors.rows?.[idx]) {
      setFieldErrors((prev) => {
        const rows = { ...prev.rows };
        delete rows[idx];
        return { ...prev, rows: Object.keys(rows).length > 0 ? rows : undefined };
      });
    }
    if (fieldErrors.splits) setFieldErrors((prev) => ({ ...prev, splits: undefined }));
  };

  if (!target) return null;

  const isIncrease = target.days < 0;
  const displayOriginal = isIncrease
    ? `+${Math.abs(target.days).toFixed(1)}`
    : `−${Math.abs(target.days).toFixed(1)}`;
  const splitTotal = splits.reduce((s, r) => s + (parseFloat(r.days) || 0), 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[540px] p-0 gap-0 overflow-hidden rounded-[10px] border-[var(--pr4-border)]">
        <DialogHeader className="px-6 pt-[18px] pb-4 border-b border-[var(--pr4-border)]">
          <DialogTitle className="text-base font-semibold text-[var(--ink)]">補正値を分割</DialogTitle>
          <DialogDescription className="text-xs text-[var(--ink-50)] mt-1">
            1件の補正値を複数のレコードに分割します。分割後の合計は元の値と一致する必要があります。
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-[22px] space-y-[18px]">
          {/* 元のレコード */}
          <div className="bg-[var(--surface-2)] border border-[var(--pr4-border)] rounded-md p-3">
            <div className="text-[10px] text-[var(--ink-50)] font-semibold uppercase tracking-wider mb-1.5">分割元</div>
            <div className="flex justify-between items-center">
              <div>
                <span className="font-mono text-xs text-[var(--ink)]">{target.recordDate || target.startDate}</span>
                <span className="mx-2 text-[var(--ink-35)]">·</span>
                <span className="text-xs text-[var(--ink-70)]">{target.reason || "-"}</span>
              </div>
              <span className={`text-sm font-semibold ${isIncrease ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                {displayOriginal}日
              </span>
            </div>
          </div>

          {/* 分割先 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              分割先 <span className="text-[var(--red)] font-semibold">必須</span>
            </label>
            <div className="space-y-2">
              {splits.map((row, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      type="date"
                      value={row.recordDate}
                      onChange={(e) => updateRow(idx, "recordDate", e.target.value)}
                      className="text-xs font-mono border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
                    />
                  </div>
                  <div className="w-[120px]">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={row.days}
                      onChange={(e) => updateRow(idx, "days", e.target.value)}
                      placeholder="日数"
                      className="text-xs font-mono border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(idx)}
                    disabled={splits.length <= 2}
                    className="h-9 w-9 p-0 text-[var(--ink-35)] hover:text-[var(--red)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {fieldErrors.rows?.[idx] && (
                    <p className="text-[10px] text-[var(--red)] absolute mt-9">{fieldErrors.rows[idx]}</p>
                  )}
                </div>
              ))}
            </div>
            {fieldErrors.rows && (
              <div className="mt-1.5">
                {Object.entries(fieldErrors.rows).map(([idx, msg]) => (
                  <p key={idx} className="text-[10px] text-[var(--red)]">行{Number(idx) + 1}: {msg}</p>
                ))}
              </div>
            )}
            {fieldErrors.splits && (
              <p className="text-xs text-[var(--red)] mt-1.5">{fieldErrors.splits}</p>
            )}
            <div className="flex justify-between items-center mt-2">
              <Button variant="ghost" size="sm" onClick={addRow} className="text-xs gap-1 text-[var(--ink-50)]">
                <Plus className="h-3 w-3" /> 行を追加
              </Button>
              <span className={`text-xs font-mono ${Math.abs(splitTotal - target.days) < 0.001 ? "text-[var(--green)]" : "text-[var(--ink-50)]"}`}>
                合計: {splitTotal.toFixed(3)} / {target.days.toFixed(3)}
              </span>
            </div>
          </div>

          {/* 理由 */}
          <div>
            <label className="text-xs font-medium text-[var(--ink-90)] flex items-center gap-1.5 mb-2">
              分割理由 <span className="text-[var(--red)] font-semibold">必須</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (fieldErrors.reason) setFieldErrors((prev) => ({ ...prev, reason: undefined }));
              }}
              placeholder="例: 取得日が判明したため、日付ごとに分割"
              className="min-h-[60px] text-[13px] border-[var(--pr4-border)] focus:border-[var(--ink)] focus:ring-[var(--ink)]/8"
            />
            {fieldErrors.reason && (
              <p className="text-xs text-[var(--red)] mt-1.5">{fieldErrors.reason}</p>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3.5 bg-[var(--surface-2)] border-t border-[var(--pr4-border)] flex items-center justify-between sm:justify-between">
          <p className="text-[11px] text-[var(--ink-50)]">元のレコードは「解除済」になり、分割先が新規作成されます</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { resetForm(); onOpenChange(false); }}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="bg-[var(--ink)] text-[var(--surface)] hover:bg-[var(--ink-90)]"
            >
              {mutation.isPending ? "分割中..." : "分割する"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
