"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Link from "next/link";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";
import {
  Calendar,
  Search,
  ChevronRight,
  ShieldAlert,
  TriangleAlert,
  CalendarClock,
  CheckCircle2,
  ArrowUpDown,
  Filter,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Timer,
  TrendingDown,
  RotateCcw,
  Building2,
  Info,
  FileText,
  Download,
  Plus,
  Edit3,
  Check,
  X,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useToast } from "@/hooks/use-toast";
import type { EmployeeAlert, MonthlyOvertime, PaidLeave, LeaveUsage } from "@/lib/schema";
import type { LeaveDeadlineInfo, ExpiryRiskInfo, ConsumptionPaceInfo, CarryoverUtilInfo } from "@/lib/leave-calc";

type AssignmentStat = {
  assignment: string;
  employeeCount: number;
  avgUsageRate: number;
  totalConsumed: number;
  under5Count: number;
};

type EmployeeSummary = {
  id: string;
  name: string;
  assignment: string;
  paidLeave: {
    consumedDays: number;
    remainingDays: number;
    totalAvailable: number;
    usageRate: number;
    grantedDays: number;
    carriedOverDays: number;
    expiredDays: number;
  } | null;
  overtime: {
    yearlyTotal: number;
    monthlyData: MonthlyOvertime[];
  };
  deadline: LeaveDeadlineInfo;
  health: {
    expiryRisk: ExpiryRiskInfo | null;
    consumptionPace: ConsumptionPaceInfo | null;
    carryoverUtil: CarryoverUtilInfo | null;
  };
  alerts: EmployeeAlert[];
  dangerCount: number;
  warningCount: number;
  infoCount: number;
  noticeCount: number;
  alertCount: number;
};

type SortKey = "name" | "consumed" | "remaining" | "usageRate" | "deadline" | "pace";
type SortDir = "asc" | "desc";
type LeaveFilter = "all" | "danger" | "warning" | "caution" | "info" | "notice" | "under5" | "achieved" | "clear";

// ─── Invalidation keys shared by mutations ──────────────────────────────────
const LEAVE_QUERY_KEYS = [
  "/api/leave-usages",
  "/api/paid-leaves",
  "/api/employee-summaries",
  "/api/overtime-alerts",
  "/api/paid-leave-alerts",
];

function invalidateLeaveQueries() {
  for (const key of LEAVE_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

// ─── LeaveEmployeeRow ────────────────────────────────────────────────────────

function LeaveEmployeeRow({
  emp,
  isExpanded,
  onToggle,
  fiscalYear,
}: {
  emp: EmployeeSummary;
  isExpanded: boolean;
  onToggle: () => void;
  fiscalYear: number;
}) {
  const { toast } = useToast();
  const leave = emp.paidLeave;
  const dl = emp.deadline;
  const leaveAlerts = emp.alerts.filter((a) => a.category === "paid_leave");
  const hasDanger = leaveAlerts.some((a) => a.severity === "danger");

  // ── Leave usage form state ─────────────────────────────────────────────
  const [usageStartDate, setUsageStartDate] = useState("");
  const [usageEndDate, setUsageEndDate] = useState("");
  const [usageDays, setUsageDays] = useState("1");
  const [usageReason, setUsageReason] = useState("");

  // ── Paid leave edit state ──────────────────────────────────────────────
  const [editGranted, setEditGranted] = useState("");
  const [editCarriedOver, setEditCarriedOver] = useState("");
  const [editExpired, setEditExpired] = useState("");
  const [isEditingLeave, setIsEditingLeave] = useState(false);

  // ── Fetch leave usages when expanded ───────────────────────────────────
  const { data: leaveUsages } = useQuery<LeaveUsage[]>({
    queryKey: ["/api/leave-usages", emp.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leave-usages?employeeId=${emp.id}`);
      return res.json();
    },
    enabled: isExpanded,
  });

  // ── Create leave usage mutation ────────────────────────────────────────
  const createUsageMutation = useMutation({
    mutationFn: async (data: { employeeId: string; startDate: string; endDate: string; days: number; reason: string }) => {
      const res = await apiRequest("POST", "/api/leave-usages", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateLeaveQueries();
      setUsageStartDate("");
      setUsageEndDate("");
      setUsageDays("1");
      setUsageReason("");
      toast({ title: "有給取得履歴を追加しました" });
    },
    onError: (error) => {
      toast({ title: "追加に失敗しました", description: String(error), variant: "destructive" });
    },
  });

  // ── Delete leave usage mutation ────────────────────────────────────────
  const deleteUsageMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/leave-usages/${id}`);
    },
    onSuccess: () => {
      invalidateLeaveQueries();
      toast({ title: "取得履歴を削除しました" });
    },
    onError: (error) => {
      toast({ title: "削除に失敗しました", description: String(error), variant: "destructive" });
    },
  });

  // ── Update paid leave mutation ─────────────────────────────────────────
  const updatePaidLeaveMutation = useMutation({
    mutationFn: async (data: { employeeId: string; fiscalYear: number; grantedDays?: number; carriedOverDays?: number; expiredDays?: number }) => {
      const res = await apiRequest("PUT", "/api/paid-leaves", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateLeaveQueries();
      setIsEditingLeave(false);
      toast({ title: "有給データを更新しました" });
    },
    onError: (error) => {
      toast({ title: "更新に失敗しました", description: String(error), variant: "destructive" });
    },
  });

  const handleAddUsage = () => {
    if (!usageStartDate || !usageEndDate) return;
    createUsageMutation.mutate({
      employeeId: emp.id,
      startDate: usageStartDate,
      endDate: usageEndDate,
      days: Number(usageDays) || 1,
      reason: usageReason,
    });
  };

  const handleStartEdit = () => {
    setEditGranted(String(leave?.grantedDays ?? 0));
    setEditCarriedOver(String(leave?.carriedOverDays ?? 0));
    setEditExpired(String(leave?.expiredDays ?? 0));
    setIsEditingLeave(true);
  };

  const handleSaveLeave = () => {
    updatePaidLeaveMutation.mutate({
      employeeId: emp.id,
      fiscalYear,
      grantedDays: Number(editGranted) || 0,
      carriedOverDays: Number(editCarriedOver) || 0,
      expiredDays: Number(editExpired) || 0,
    });
  };

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${hasDanger ? "bg-red-50/30 dark:bg-red-950/10" : ""} ${isExpanded ? "bg-muted/10" : ""}`}
        data-testid={`row-leave-${emp.id}`}
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
            <Link
              href={`/employees/${emp.id}`}
              className="font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {emp.name}
            </Link>
          </div>
        </td>
        <td className="px-3 py-2 text-muted-foreground text-xs">{emp.assignment}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <span className={`font-semibold ${leave && leave.consumedDays < 5 ? "text-red-600 dark:text-red-400" : ""}`}>
            {leave ? Number(leave.consumedDays).toFixed(2) : "-"}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">
          {leave ? Number(leave.remainingDays).toFixed(2) : "-"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          <span
            className={`font-semibold ${
              leave && leave.usageRate >= 0.7
                ? "text-emerald-600 dark:text-emerald-400"
                : leave && leave.usageRate >= 0.3
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {leave ? `${(leave.usageRate * 100).toFixed(2)}%` : "-"}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          {leave ? (
            <div className="flex items-center justify-center gap-1">
              <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    leave.consumedDays >= 5
                      ? "bg-emerald-500"
                      : leave.consumedDays >= 3
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(100, (leave.consumedDays / 5) * 100)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.min(leave.consumedDays, 5)}/5
              </span>
            </div>
          ) : (
            "-"
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {dl.paceStatus !== "not_eligible" ? (
            <span
              className={`font-medium ${
                dl.daysUntilDeadline <= 30
                  ? "text-red-600 dark:text-red-400"
                  : dl.daysUntilDeadline <= 90
                  ? "text-amber-600 dark:text-amber-400"
                  : ""
              }`}
            >
              {dl.daysUntilDeadline > 0 ? `${dl.daysUntilDeadline}日` : "超過"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          {dl.paceStatus === "ok" && leave && leave.consumedDays >= 5 && (
            <div className="flex flex-col items-center gap-0.5">
              <Badge variant="outline" className="text-xs px-1.5 py-0 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                達成
              </Badge>
              {emp.health?.expiryRisk && (emp.health.expiryRisk.riskLevel === "high" || emp.health.expiryRisk.riskLevel === "medium") && (
                <span className="text-xs text-amber-600 dark:text-amber-400">消化遅れ</span>
              )}
            </div>
          )}
          {dl.paceStatus === "ok" && (!leave || leave.consumedDays < 5) && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
              余裕
            </Badge>
          )}
          {dl.paceStatus === "tight" && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              注意
            </Badge>
          )}
          {dl.paceStatus === "danger" && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              危険
            </Badge>
          )}
          {dl.paceStatus === "overdue" && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              超過
            </Badge>
          )}
          {dl.paceStatus === "not_eligible" && (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          <div className="flex flex-wrap justify-center gap-0.5">
            {emp.health?.expiryRisk && emp.health.expiryRisk.riskLevel !== "none" && (
              <span className={`inline-block rounded px-1 py-0 text-xs font-medium ${
                emp.health.expiryRisk.riskLevel === "high"
                  ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              }`} title={emp.health.expiryRisk.message}>
                失効
              </span>
            )}
            {emp.health?.consumptionPace && emp.health.consumptionPace.paceLevel !== "not_applicable" && emp.health.consumptionPace.paceLevel !== "good" && (
              <span className={`inline-block rounded px-1 py-0 text-xs font-medium ${
                emp.health.consumptionPace.paceLevel === "very_slow"
                  ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              }`} title={emp.health.consumptionPace.message}>
                ペース
              </span>
            )}
            {emp.health?.carryoverUtil && (emp.health.carryoverUtil.utilLevel === "warning" || emp.health.carryoverUtil.utilLevel === "danger") && (
              <span className={`inline-block rounded px-1 py-0 text-xs font-medium ${
                emp.health.carryoverUtil.utilLevel === "danger"
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              }`} title={emp.health.carryoverUtil.message}>
                繰越
              </span>
            )}
            {(!emp.health?.expiryRisk || emp.health.expiryRisk.riskLevel === "none") &&
             (!emp.health?.consumptionPace || emp.health.consumptionPace.paceLevel === "good" || emp.health.consumptionPace.paceLevel === "not_applicable") &&
             (!emp.health?.carryoverUtil || emp.health.carryoverUtil.utilLevel === "good" || emp.health.carryoverUtil.utilLevel === "not_applicable") && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">良好</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          {leaveAlerts.length > 0 ? (
            <div className="space-y-0.5">
              {leaveAlerts.map((a, i) => (
                <div key={i} className="flex items-center gap-1 text-xs">
                  {a.severity === "danger" ? (
                    <ShieldAlert className="h-3 w-3 text-red-500 shrink-0" />
                  ) : a.severity === "notice" ? (
                    <FileText className="h-3 w-3 text-slate-400 shrink-0" />
                  ) : a.severity === "info" ? (
                    <Info className="h-3 w-3 text-blue-500 shrink-0" />
                  ) : (
                    <TriangleAlert className="h-3 w-3 text-amber-500 shrink-0" />
                  )}
                  <span className={`${
                    a.severity === "danger" ? "text-red-700 dark:text-red-400" :
                    a.severity === "notice" ? "text-slate-500 dark:text-slate-400" :
                    a.severity === "info" ? "text-blue-700 dark:text-blue-400" :
                    "text-amber-700 dark:text-amber-400"
                  }`}>
                    {a.message}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">問題なし</span>
          )}
        </td>
      </tr>

      {/* Expanded Panel */}
      {isExpanded && (
        <tr>
          <td colSpan={10} className="p-0">
            <div className="bg-muted/5 border-l-2 border-primary/30 px-4 py-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Section A: 有給取得履歴の追加 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">有給取得履歴の追加</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">開始日</label>
                      <DateInput
                        className="h-8 text-sm"
                        value={usageStartDate}
                        onChange={(v) => setUsageStartDate(v)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">終了日</label>
                      <DateInput
                        className="h-8 text-sm"
                        value={usageEndDate}
                        onChange={(v) => setUsageEndDate(v)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">日数</label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0.5"
                        className="h-8 text-sm"
                        value={usageDays}
                        onChange={(e) => setUsageDays(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">理由</label>
                      <Input
                        type="text"
                        className="h-8 text-sm"
                        placeholder="任意"
                        value={usageReason}
                        onChange={(e) => setUsageReason(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleAddUsage}
                    disabled={!usageStartDate || !usageEndDate || createUsageMutation.isPending}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {createUsageMutation.isPending ? "追加中..." : "追加"}
                  </Button>

                  {/* Existing leave usages list */}
                  {leaveUsages && leaveUsages.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <p className="text-xs text-muted-foreground font-medium">取得履歴</p>
                      {leaveUsages.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1.5 border">
                          <span className="tabular-nums">{u.startDate} 〜 {u.endDate}</span>
                          <Badge variant="outline" className="text-xs px-1 py-0">{Number(u.days).toFixed(2)}日</Badge>
                          {u.reason && <span className="text-muted-foreground truncate">{u.reason}</span>}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteUsageMutation.mutate(u.id)}
                            disabled={deleteUsageMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {leaveUsages && leaveUsages.length === 0 && (
                    <p className="text-xs text-muted-foreground">取得履歴なし</p>
                  )}
                </div>

                {/* Section B: 有給データ修正 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Edit3 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">有給データ修正</span>
                    {!isEditingLeave && leave && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs ml-auto"
                        onClick={handleStartEdit}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        編集
                      </Button>
                    )}
                  </div>

                  {leave ? (
                    <div className="space-y-2">
                      {/* Editable fields */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">付与日数</label>
                          {isEditingLeave ? (
                            <Input
                              type="number"
                              step="0.5"
                              className="h-8 text-sm"
                              value={editGranted}
                              onChange={(e) => setEditGranted(e.target.value)}
                            />
                          ) : (
                            <p className="text-sm font-medium tabular-nums">{Number(leave.grantedDays).toFixed(2)}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">繰越日数</label>
                          {isEditingLeave ? (
                            <Input
                              type="number"
                              step="0.5"
                              className="h-8 text-sm"
                              value={editCarriedOver}
                              onChange={(e) => setEditCarriedOver(e.target.value)}
                            />
                          ) : (
                            <p className="text-sm font-medium tabular-nums">{Number(leave.carriedOverDays).toFixed(2)}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">失効日数</label>
                          {isEditingLeave ? (
                            <Input
                              type="number"
                              step="0.5"
                              className="h-8 text-sm"
                              value={editExpired}
                              onChange={(e) => setEditExpired(e.target.value)}
                            />
                          ) : (
                            <p className="text-sm font-medium tabular-nums">{Number(leave.expiredDays).toFixed(2)}</p>
                          )}
                        </div>
                      </div>

                      {/* Read-only fields */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">消化日数 <span className="text-xs text-muted-foreground/60">（自動）</span></label>
                          <p className="text-sm font-medium tabular-nums text-muted-foreground">{Number(leave.consumedDays).toFixed(2)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">残日数 <span className="text-xs text-muted-foreground/60">（自動）</span></label>
                          <p className="text-sm font-medium tabular-nums text-muted-foreground">{Number(leave.remainingDays).toFixed(2)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">取得率 <span className="text-xs text-muted-foreground/60">（自動）</span></label>
                          <p className="text-sm font-medium tabular-nums text-muted-foreground">{(leave.usageRate * 100).toFixed(2)}%</p>
                        </div>
                      </div>

                      {isEditingLeave && (
                        <div className="flex gap-2 mt-1">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleSaveLeave}
                            disabled={updatePaidLeaveMutation.isPending}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            {updatePaidLeaveMutation.isPending ? "保存中..." : "保存"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setIsEditingLeave(false)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            キャンセル
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">有給データなし</p>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function LeaveManagement() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LeaveFilter>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("pace");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { fiscalYear } = useFiscalYear();

  const { data: summaries, isLoading } = useQuery<EmployeeSummary[]>({
    queryKey: ["/api/employee-summaries", fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employee-summaries?year=${fiscalYear}`);
      return res.json();
    },
  });

  const { data: assignmentStats } = useQuery<AssignmentStat[]>({
    queryKey: ["/api/assignment-leave-stats", fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assignment-leave-stats?year=${fiscalYear}`);
      return res.json();
    },
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  // 配属先の一覧を取得（ソート済み）
  const assignmentOptions = useMemo(() => {
    if (!summaries) return [];
    const set = new Set(summaries.map((e) => e.assignment));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [summaries]);

  const filtered = useMemo(() => {
    if (!summaries) return [];
    let list = [...summaries];

    // 配属先フィルター
    if (assignmentFilter !== "all") {
      list = list.filter((e) => e.assignment === assignmentFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.assignment.toLowerCase().includes(q)
      );
    }

    const leaveAlerts = (e: EmployeeSummary) =>
      e.alerts.filter((a) => a.category === "paid_leave");

    switch (filter) {
      case "danger":
        list = list.filter((e) => leaveAlerts(e).some((a) => a.severity === "danger"));
        break;
      case "warning":
        list = list.filter((e) => leaveAlerts(e).some((a) => a.severity === "warning"));
        break;
      case "caution":
        list = list.filter((e) => leaveAlerts(e).some((a) => a.severity === "caution"));
        break;
      case "info":
        list = list.filter((e) => leaveAlerts(e).some((a) => a.severity === "info"));
        break;
      case "notice":
        list = list.filter((e) => leaveAlerts(e).some((a) => a.severity === "notice"));
        break;
      case "under5":
        list = list.filter((e) => e.paidLeave && e.paidLeave.consumedDays < 5);
        break;
      case "achieved":
        list = list.filter((e) => e.paidLeave && e.paidLeave.consumedDays >= 5);
        break;
      case "clear":
        list = list.filter((e) => leaveAlerts(e).length === 0);
        break;
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name, "ja");
        case "consumed":
          return dir * ((a.paidLeave?.consumedDays ?? 0) - (b.paidLeave?.consumedDays ?? 0));
        case "remaining":
          return dir * ((a.paidLeave?.remainingDays ?? 0) - (b.paidLeave?.remainingDays ?? 0));
        case "usageRate":
          return dir * ((a.paidLeave?.usageRate ?? 0) - (b.paidLeave?.usageRate ?? 0));
        case "deadline":
          return dir * (a.deadline.daysUntilDeadline - b.deadline.daysUntilDeadline);
        case "pace": {
          const order = { overdue: 0, danger: 1, tight: 2, not_eligible: 4, ok: 3 };
          const diff = order[a.deadline.paceStatus] - order[b.deadline.paceStatus];
          if (diff !== 0) return dir * diff;
          return a.deadline.daysUntilDeadline - b.deadline.daysUntilDeadline;
        }
        default:
          return 0;
      }
    });

    return list;
  }, [summaries, search, filter, assignmentFilter, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold" data-testid="page-title">有給管理</h1>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  if (!summaries) return null;

  // KPI calculations
  const withLeave = summaries.filter((e) => e.paidLeave);
  const under5 = withLeave.filter((e) => e.paidLeave!.consumedDays < 5);
  const achieved5 = withLeave.filter((e) => e.paidLeave!.consumedDays >= 5);
  const avgUsageRate =
    withLeave.length > 0
      ? withLeave.reduce((s, e) => s + e.paidLeave!.usageRate, 0) / withLeave.length
      : 0;
  const leaveAlertEmps = summaries.filter((e) =>
    e.alerts.some((a) => a.category === "paid_leave" && a.severity !== "info" && a.severity !== "notice")
  );
  const dangerLeaveEmps = summaries.filter((e) =>
    e.alerts.some((a) => a.category === "paid_leave" && a.severity === "danger")
  );
  const infoLeaveEmps = summaries.filter((e) =>
    e.alerts.some((a) => a.category === "paid_leave" && a.severity === "info")
  );
  const noticeLeaveEmps = summaries.filter((e) =>
    e.alerts.some((a) => a.category === "paid_leave" && a.severity === "notice")
  );
  const paceProblems = summaries.filter(
    (e) => e.deadline.paceStatus === "danger" || e.deadline.paceStatus === "overdue"
  );
  const expiryRiskEmps = summaries.filter(
    (e) => e.health?.expiryRisk && (e.health.expiryRisk.riskLevel === "high" || e.health.expiryRisk.riskLevel === "medium")
  );
  const slowPaceEmps = summaries.filter(
    (e) => e.health?.consumptionPace && (e.health.consumptionPace.paceLevel === "slow" || e.health.consumptionPace.paceLevel === "very_slow")
  );
  const carryoverRiskEmps = summaries.filter(
    (e) => e.health?.carryoverUtil && (e.health.carryoverUtil.utilLevel === "warning" || e.health.carryoverUtil.utilLevel === "danger")
  );

  const warningOnlyEmps = summaries.filter((e) =>
    e.alerts.some((a) => a.category === "paid_leave" && a.severity === "warning")
  );
  const cautionLeaveEmps = summaries.filter((e) =>
    e.alerts.some((a) => a.category === "paid_leave" && a.severity === "caution")
  );
  const filterButtons: { key: LeaveFilter; label: string; count: number }[] = [
    { key: "all", label: "全員", count: summaries.length },
    { key: "danger", label: "違反", count: dangerLeaveEmps.length },
    { key: "warning", label: "警告", count: warningOnlyEmps.length },
    { key: "caution", label: "注意", count: cautionLeaveEmps.length },
    { key: "info", label: "参考", count: infoLeaveEmps.length },
    { key: "notice", label: "管理情報", count: noticeLeaveEmps.length },
    { key: "under5", label: "5日未達", count: under5.length },
    { key: "achieved", label: "5日達成", count: achieved5.length },
    { key: "clear", label: "問題なし", count: summaries.filter(e => !e.alerts.some(a => a.category === "paid_leave")).length },
  ];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" data-testid="page-title">有給管理</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
              window.open(`${API_BASE}/api/export/leave-management?year=${fiscalYear}`, "_blank");
            }}
            data-testid="button-export-leave"
          >
            <Download className="h-3.5 w-3.5" />
            CSVエクスポート
          </Button>
          <FiscalYearSelector />
        </div>
      </div>

      {/* KPI Strip - 法的義務 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">5日未達成</p>
                <p className="text-lg font-bold mt-0.5 text-red-600 dark:text-red-400">
                  {under5.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-red-50 dark:bg-red-950/40">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">5日達成済</p>
                <p className="text-lg font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {achieved5.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/40">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">平均取得率</p>
                <p className={`text-lg font-bold mt-0.5 ${avgUsageRate < 0.3 ? "text-red-600 dark:text-red-400" : avgUsageRate < 0.5 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {(avgUsageRate * 100).toFixed(2)}%
                </p>
              </div>
              <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/40">
                <Calendar className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">アラート該当者</p>
                <p className={`text-lg font-bold mt-0.5 ${leaveAlertEmps.length > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {leaveAlertEmps.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/40">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Strip - 健全性指標 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">失効リスク</p>
                <p className={`text-lg font-bold mt-0.5 ${expiryRiskEmps.length > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {expiryRiskEmps.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-red-50 dark:bg-red-950/40">
                <Timer className="h-4 w-4 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">取得ペース遅れ</p>
                <p className={`text-lg font-bold mt-0.5 ${slowPaceEmps.length > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {slowPaceEmps.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/40">
                <TrendingDown className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">繰越未消化</p>
                <p className={`text-lg font-bold mt-0.5 ${carryoverRiskEmps.length > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>
                  {carryoverRiskEmps.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-orange-50 dark:bg-orange-950/40">
                <RotateCcw className="h-4 w-4 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">義務ペース危険</p>
                <p className={`text-lg font-bold mt-0.5 ${paceProblems.length > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {paceProblems.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/40">
                <CalendarClock className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="氏名・配属先で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-leave"
            />
          </div>
          <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
            <SelectTrigger className="h-9 w-[220px] text-sm" data-testid="select-assignment-filter">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground mr-1.5 shrink-0" />
              <SelectValue placeholder="配属先" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての配属先</SelectItem>
              {assignmentOptions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {filterButtons.map((fb) => (
            <Button
              key={fb.key}
              variant={filter === fb.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => setFilter(fb.key)}
              data-testid={`filter-leave-${fb.key}`}
            >
              {fb.label}
              <span className="ml-1 opacity-70">{fb.count}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* 配属先別取得率ランク（折りたたみ式） */}
      {assignmentStats && assignmentStats.length > 0 && (
        <Collapsible defaultOpen={false}>
          <Card className="border">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 pt-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    配属先別 有給取得率ランク
                    <span className="text-xs font-normal text-muted-foreground">({assignmentStats.length}件)</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-4 pb-3 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="assignment-rank-table">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">配属先</th>
                        <th className="px-3 py-2 font-medium text-right">人数</th>
                        <th className="px-3 py-2 font-medium text-right">平均取得率</th>
                        <th className="px-3 py-2 font-medium">取得率バー</th>
                        <th className="px-3 py-2 font-medium text-right">5日未達</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentStats.map((stat) => (
                        <tr key={stat.assignment} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{stat.assignment}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{stat.employeeCount}名</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className={`font-semibold ${
                              stat.avgUsageRate < 0.1 ? "text-red-600 dark:text-red-400" :
                              stat.avgUsageRate < 0.3 ? "text-amber-600 dark:text-amber-400" :
                              "text-emerald-600 dark:text-emerald-400"
                            }`}>
                              {(stat.avgUsageRate * 100).toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  stat.avgUsageRate < 0.1 ? "bg-red-400" :
                                  stat.avgUsageRate < 0.3 ? "bg-amber-400" :
                                  "bg-emerald-400"
                                }`}
                                style={{ width: `${Math.min(100, stat.avgUsageRate * 100)}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {stat.under5Count > 0 ? (
                              <span className="text-red-600 dark:text-red-400 font-semibold">{stat.under5Count}名</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* 社員別セクション */}
      <div>
        <h2 className="text-base font-semibold">社員別 有給取得状況</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{filtered.length}名表示中</p>
      </div>

      {/* Table */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="leave-table">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("name")}>
                      氏名 <SortIcon col="name" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">配属先</th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("consumed")}>
                      消化日数 <SortIcon col="consumed" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("remaining")}>
                      残日数 <SortIcon col="remaining" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("usageRate")}>
                      取得率 <SortIcon col="usageRate" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-center">5日義務</th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("deadline")}>
                      期限まで <SortIcon col="deadline" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-center">
                    <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("pace")}>
                      5日義務 ペース <SortIcon col="pace" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-center">健全性</th>
                  <th className="px-3 py-2.5 font-medium">アラート</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <LeaveEmployeeRow
                    key={emp.id}
                    emp={emp}
                    isExpanded={expandedId === emp.id}
                    onToggle={() => setExpandedId(expandedId === emp.id ? null : emp.id)}
                    fiscalYear={fiscalYear}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Filter className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">該当する社員がいません</p>
        </div>
      )}

      <PerplexityAttribution />
    </div>
  );
}
