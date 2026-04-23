"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Link from "next/link";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";
import {
  Users,
  AlertTriangle,
  Clock,
  Calendar,
  ChevronRight,
  ShieldAlert,
  TriangleAlert,
  Filter,
  FileText,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchWithHistory } from "@/components/search-with-history";
import { FooterAttribution } from "@/components/FooterAttribution";
import type { EmployeeAlert, MonthlyOvertime } from "@/lib/schema";
import type { LeaveDeadlineInfo, ExpiryRiskInfo, ConsumptionPaceInfo, CarryoverUtilInfo } from "@/lib/leave-calc";

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
  cautionCount: number;
  infoCount: number;
  noticeCount: number;
  leaveDangerCount: number;
  leaveWarningCount: number;
  leaveCautionCount: number;
  leaveInfoCount: number;
  leaveNoticeCount: number;
  leaveAlertCount: number;
  overtimeDangerCount: number;
  overtimeWarningCount: number;
  overtimeCautionCount: number;
  overtimeInfoCount: number;
  overtimeAlertCount: number;
  alertCount: number;
  compositeRisk: "high" | "medium" | null;
  compositeComment: string | null;
};

type FilterMode = "all" | "leave_danger" | "leave_warning" | "leave_caution" | "leave_info" | "leave_notice" | "ot_danger" | "ot_warning" | "ot_caution" | "ot_info" | "composite" | "clear";

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const { fiscalYear } = useFiscalYear();

  const { data: summaries, isLoading } = useQuery<EmployeeSummary[]>({
    queryKey: ["/api/employee-summaries", fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employee-summaries?year=${fiscalYear}`);
      return res.json();
    },
  });

  // Compute dashboard stats from summaries
  const stats = useMemo(() => {
    if (!summaries) return null;
    const withLeave = summaries.filter(e => e.paidLeave);
    const avgUsageRate = withLeave.length > 0
      ? withLeave.reduce((s, e) => s + (e.paidLeave?.usageRate ?? 0), 0) / withLeave.length
      : 0;
    return {
      totalEmployees: summaries.length,
      avgUsageRate,
      leaveDanger: summaries.filter(e => e.leaveDangerCount > 0).length,
      leaveWarning: summaries.filter(e => e.leaveWarningCount > 0 && e.leaveDangerCount === 0).length,
      leaveCaution: summaries.filter(e => e.leaveCautionCount > 0).length,
      leaveInfo: summaries.filter(e => e.leaveInfoCount > 0).length,
      leaveNotice: summaries.filter(e => e.leaveNoticeCount > 0).length,
      otDanger: summaries.filter(e => e.overtimeDangerCount > 0).length,
      otWarning: summaries.filter(e => e.overtimeWarningCount > 0 && e.overtimeDangerCount === 0).length,
      otCaution: summaries.filter(e => e.overtimeCautionCount > 0).length,
      otInfo: summaries.filter(e => e.overtimeInfoCount > 0).length,
      composite: summaries.filter(e => e.compositeRisk !== null).length,
      compositeHigh: summaries.filter(e => e.compositeRisk === "high").length,
      clear: summaries.filter(e => e.alertCount === 0).length,
    };
  }, [summaries]);

  const filtered = useMemo(() => {
    if (!summaries) return [];
    let list = summaries;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.assignment.toLowerCase().includes(q)
      );
    }

    switch (filter) {
      case "leave_danger":
        list = list.filter((e) => e.leaveDangerCount > 0);
        break;
      case "leave_warning":
        list = list.filter((e) => e.leaveWarningCount > 0);
        break;
      case "leave_caution":
        list = list.filter((e) => e.leaveCautionCount > 0);
        break;
      case "composite":
        list = list.filter((e) => e.compositeRisk !== null);
        break;
      case "leave_info":
        list = list.filter((e) => e.leaveInfoCount > 0);
        break;
      case "leave_notice":
        list = list.filter((e) => e.leaveNoticeCount > 0);
        break;
      case "ot_danger":
        list = list.filter((e) => e.overtimeDangerCount > 0);
        break;
      case "ot_warning":
        list = list.filter((e) => e.overtimeWarningCount > 0);
        break;
      case "ot_caution":
        list = list.filter((e) => e.overtimeCautionCount > 0);
        break;
      case "ot_info":
        list = list.filter((e) => e.overtimeInfoCount > 0);
        break;
      case "clear":
        list = list.filter((e) => e.alertCount === 0);
        break;
    }

    list.sort((a, b) => {
      if (a.dangerCount !== b.dangerCount) return b.dangerCount - a.dangerCount;
      if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount;
      return a.name.localeCompare(b.name, "ja");
    });

    return list;
  }, [summaries, search, filter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold" data-testid="page-title">ダッシュボード</h1>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!summaries || !stats) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" data-testid="page-title">ダッシュボード</h1>
        <FiscalYearSelector />
      </div>

      {/* Top KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">社員数</p>
                <p className="text-lg font-bold mt-0.5">{stats.totalEmployees}名</p>
              </div>
              <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/40">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">平均有給取得率</p>
                <p className="text-lg font-bold mt-0.5">{(stats.avgUsageRate * 100).toFixed(2)}%</p>
              </div>
              <div className={`rounded-lg p-2 ${stats.avgUsageRate < 0.5 ? "bg-amber-50 dark:bg-amber-950/40" : "bg-emerald-50 dark:bg-emerald-950/40"}`}>
                <Calendar className={`h-4 w-4 ${stats.avgUsageRate < 0.5 ? "text-amber-500" : "text-emerald-500"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">有給アラート</p>
                <p className="text-lg font-bold mt-0.5">
                  <span className="text-red-500">{stats.leaveDanger}</span>
                  <span className="text-xs text-muted-foreground mx-1">/</span>
                  <span className="text-amber-500">{stats.leaveWarning}</span>
                  <span className="text-xs text-muted-foreground ml-1">名</span>
                </p>
              </div>
              <div className={`rounded-lg p-2 ${stats.leaveDanger > 0 ? "bg-red-50 dark:bg-red-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}>
                <Calendar className={`h-4 w-4 ${stats.leaveDanger > 0 ? "text-red-500" : "text-amber-500"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">残業アラート</p>
                <p className="text-lg font-bold mt-0.5">
                  <span className="text-red-500">{stats.otDanger}</span>
                  <span className="text-xs text-muted-foreground mx-1">/</span>
                  <span className="text-amber-500">{stats.otWarning}</span>
                  <span className="text-xs text-muted-foreground ml-1">名</span>
                </p>
              </div>
              <div className={`rounded-lg p-2 ${stats.otDanger > 0 ? "bg-red-50 dark:bg-red-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}>
                <Clock className={`h-4 w-4 ${stats.otDanger > 0 ? "text-red-500" : "text-amber-500"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border ${stats.composite > 0 ? "border-purple-300 dark:border-purple-800" : ""}`}>
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">複合リスク</p>
                <p className="text-lg font-bold mt-0.5">
                  {stats.composite > 0 ? (
                    <>
                      <span className="text-purple-600 dark:text-purple-400">{stats.composite}</span>
                      <span className="text-xs text-muted-foreground ml-1">名</span>
                    </>
                  ) : (
                    <span className="text-emerald-500">0名</span>
                  )}
                </p>
              </div>
              <div className={`rounded-lg p-2 ${stats.composite > 0 ? "bg-purple-50 dark:bg-purple-950/40" : "bg-emerald-50 dark:bg-emerald-950/40"}`}>
                <ShieldAlert className={`h-4 w-4 ${stats.composite > 0 ? "text-purple-500" : "text-emerald-500"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SearchWithHistory
          value={search}
          onChange={setSearch}
          className="pl-9 h-9"
          data-testid="input-search"
        />
        <div className="flex gap-1.5 flex-wrap">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs px-2.5"
            onClick={() => setFilter("all")}
            data-testid="filter-all"
          >
            全員 <span className="ml-1 opacity-70">{stats.totalEmployees}</span>
          </Button>

          {/* 有給フィルター群 */}
          <div className="flex items-center gap-1 border-l pl-1.5 ml-0.5">
            <span className="text-xs text-muted-foreground mr-0.5">有給</span>
            {stats.leaveDanger > 0 && (
              <Button
                variant={filter === "leave_danger" ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs px-2 ${filter !== "leave_danger" ? "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400" : ""}`}
                onClick={() => setFilter(filter === "leave_danger" ? "all" : "leave_danger")}
                data-testid="filter-leave-danger"
              >
                違反 <span className="ml-1 opacity-70">{stats.leaveDanger}</span>
              </Button>
            )}
            <Button
              variant={filter === "leave_warning" ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs px-2 ${filter !== "leave_warning" ? "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400" : ""}`}
              onClick={() => setFilter(filter === "leave_warning" ? "all" : "leave_warning")}
              data-testid="filter-leave-warning"
            >
              警告 <span className="ml-1 opacity-70">{summaries.filter(e => e.leaveWarningCount > 0).length}</span>
            </Button>
            {stats.leaveCaution > 0 && (
              <Button
                variant={filter === "leave_caution" ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs px-2 ${filter !== "leave_caution" ? "border-cyan-200 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-400" : ""}`}
                onClick={() => setFilter(filter === "leave_caution" ? "all" : "leave_caution")}
                data-testid="filter-leave-caution"
              >
                注意 <span className="ml-1 opacity-70">{stats.leaveCaution}</span>
              </Button>
            )}
            {stats.leaveInfo > 0 && (
              <Button
                variant={filter === "leave_info" ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs px-2 ${filter !== "leave_info" ? "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400" : ""}`}
                onClick={() => setFilter(filter === "leave_info" ? "all" : "leave_info")}
                data-testid="filter-leave-info"
              >
                参考 <span className="ml-1 opacity-70">{stats.leaveInfo}</span>
              </Button>
            )}
            {stats.leaveNotice > 0 && (
              <Button
                variant={filter === "leave_notice" ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs px-2 ${filter !== "leave_notice" ? "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400" : ""}`}
                onClick={() => setFilter(filter === "leave_notice" ? "all" : "leave_notice")}
                data-testid="filter-leave-notice"
              >
                管理情報 <span className="ml-1 opacity-70">{stats.leaveNotice}</span>
              </Button>
            )}
          </div>

          {/* 残業フィルター群 */}
          <div className="flex items-center gap-1 border-l pl-1.5 ml-0.5">
            <span className="text-xs text-muted-foreground mr-0.5">残業</span>
            <Button
              variant={filter === "ot_danger" ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs px-2 ${filter !== "ot_danger" ? "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400" : ""}`}
              onClick={() => setFilter(filter === "ot_danger" ? "all" : "ot_danger")}
              data-testid="filter-ot-danger"
            >
              違反 <span className="ml-1 opacity-70">{stats.otDanger}</span>
            </Button>
            <Button
              variant={filter === "ot_warning" ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs px-2 ${filter !== "ot_warning" ? "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400" : ""}`}
              onClick={() => setFilter(filter === "ot_warning" ? "all" : "ot_warning")}
              data-testid="filter-ot-warning"
            >
              警告 <span className="ml-1 opacity-70">{summaries.filter(e => e.overtimeWarningCount > 0).length}</span>
            </Button>
            {stats.otCaution > 0 && (
              <Button
                variant={filter === "ot_caution" ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs px-2 ${filter !== "ot_caution" ? "border-cyan-200 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-400" : ""}`}
                onClick={() => setFilter(filter === "ot_caution" ? "all" : "ot_caution")}
                data-testid="filter-ot-caution"
              >
                注意 <span className="ml-1 opacity-70">{stats.otCaution}</span>
              </Button>
            )}
            {stats.otInfo > 0 && (
              <Button
                variant={filter === "ot_info" ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs px-2 ${filter !== "ot_info" ? "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400" : ""}`}
                onClick={() => setFilter(filter === "ot_info" ? "all" : "ot_info")}
                data-testid="filter-ot-info"
              >
                参考 <span className="ml-1 opacity-70">{stats.otInfo}</span>
              </Button>
            )}
          </div>

          {stats.composite > 0 && (
            <div className="flex items-center gap-1 border-l pl-1.5 ml-0.5">
              <Button
                variant={filter === "composite" ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs px-2 ${filter !== "composite" ? "border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400" : ""}`}
                onClick={() => setFilter(filter === "composite" ? "all" : "composite")}
                data-testid="filter-composite"
              >
                複合リスク <span className="ml-1 opacity-70">{stats.composite}</span>
              </Button>
            </div>
          )}

          <Button
            variant={filter === "clear" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs px-2.5 ml-0.5"
            onClick={() => setFilter(filter === "clear" ? "all" : "clear")}
            data-testid="filter-clear"
          >
            問題なし <span className="ml-1 opacity-70">{stats.clear}</span>
          </Button>
        </div>
      </div>

      {/* Employee Cards Grid */}
      <div className="text-sm text-muted-foreground">
        {filtered.length}名表示中
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="employee-cards">
        {filtered.map((emp) => (
          <EmployeeCard key={emp.id} emp={emp} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Filter className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">該当する社員がいません</p>
        </div>
      )}

      <FooterAttribution />
    </div>
  );
}

function EmployeeCard({ emp }: { emp: EmployeeSummary }) {
  const hasDanger = emp.dangerCount > 0;
  const hasWarning = emp.warningCount > 0 && !hasDanger;
  const hasComposite = emp.compositeRisk !== null;
  const borderColor = hasComposite
    ? "border-purple-300 dark:border-purple-800"
    : hasDanger
    ? "border-red-300 dark:border-red-800"
    : hasWarning
    ? "border-amber-300 dark:border-amber-800"
    : "border-border";
  const bgHighlight = hasComposite
    ? "bg-purple-50/30 dark:bg-purple-950/10"
    : hasDanger
    ? "bg-red-50/50 dark:bg-red-950/20"
    : hasWarning
    ? "bg-amber-50/30 dark:bg-amber-950/10"
    : "";

  const leave = emp.paidLeave;
  const dl = emp.deadline;
  const usagePercent = leave ? (leave.usageRate * 100).toFixed(2) : "-";
  const usageColor =
    leave && leave.usageRate >= 0.7
      ? "text-emerald-600 dark:text-emerald-400"
      : leave && leave.usageRate >= 0.3
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  const leaveAlerts = emp.alerts.filter(a => a.category === "paid_leave");
  const overtimeAlerts = emp.alerts.filter(a => a.category === "overtime");

  return (
    <Link href={`/employees/${emp.id}`}>
      <Card
        className={`border ${borderColor} ${bgHighlight} hover:shadow-md transition-all cursor-pointer group`}
        data-testid={`card-employee-${emp.id}`}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                {emp.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">{emp.assignment}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
              {/* 有給バッジ */}
              {(emp.leaveDangerCount > 0 || emp.leaveWarningCount > 0 || emp.leaveCautionCount > 0 || emp.leaveInfoCount > 0 || emp.leaveNoticeCount > 0) && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">有給</span>
                  {emp.leaveDangerCount > 0 && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">
                      違反{emp.leaveDangerCount}
                    </Badge>
                  )}
                  {emp.leaveWarningCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    >
                      警告{emp.leaveWarningCount}
                    </Badge>
                  )}
                  {emp.leaveCautionCount > 0 && emp.leaveDangerCount === 0 && emp.leaveWarningCount === 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400"
                    >
                      注意{emp.leaveCautionCount}
                    </Badge>
                  )}
                  {emp.leaveInfoCount > 0 && emp.leaveDangerCount === 0 && emp.leaveWarningCount === 0 && emp.leaveCautionCount === 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                    >
                      参考{emp.leaveInfoCount}
                    </Badge>
                  )}
                  {emp.leaveNoticeCount > 0 && emp.leaveDangerCount === 0 && emp.leaveWarningCount === 0 && emp.leaveCautionCount === 0 && emp.leaveInfoCount === 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400"
                    >
                      管理情報
                    </Badge>
                  )}
                </div>
              )}
              {/* 残業バッジ */}
              {(emp.overtimeDangerCount > 0 || emp.overtimeWarningCount > 0 || emp.overtimeCautionCount > 0 || emp.overtimeInfoCount > 0) && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">残業</span>
                  {emp.overtimeDangerCount > 0 && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">
                      違反{emp.overtimeDangerCount}
                    </Badge>
                  )}
                  {emp.overtimeWarningCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    >
                      警告{emp.overtimeWarningCount}
                    </Badge>
                  )}
                  {emp.overtimeCautionCount > 0 && emp.overtimeDangerCount === 0 && emp.overtimeWarningCount === 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400"
                    >
                      注意{emp.overtimeCautionCount}
                    </Badge>
                  )}
                  {emp.overtimeInfoCount > 0 && emp.overtimeDangerCount === 0 && emp.overtimeWarningCount === 0 && emp.overtimeCautionCount === 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs px-1.5 py-0 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                    >
                      参考{emp.overtimeInfoCount}
                    </Badge>
                  )}
                </div>
              )}
              {emp.alertCount === 0 && (
                <Badge
                  variant="outline"
                  className="text-xs px-1.5 py-0 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  OK
                </Badge>
              )}
            </div>
          </div>

          {/* Data strip */}
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            <div>
              <p className="text-xs text-muted-foreground">有給取得率</p>
              <p className={`text-sm font-bold tabular-nums ${usageColor}`}>
                {usagePercent}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">年間残業</p>
              <p
                className={`text-sm font-bold tabular-nums ${
                  emp.overtime.yearlyTotal > 360
                    ? "text-red-600 dark:text-red-400"
                    : emp.overtime.yearlyTotal > 300
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground"
                }`}
              >
                {emp.overtime.yearlyTotal.toFixed(2)}h
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">有給残日数</p>
              <p className="text-sm font-bold tabular-nums">
                {leave ? `${Number(leave.remainingDays).toFixed(2)}日` : "-"}
              </p>
            </div>
          </div>

          {/* Deadline / pace strip */}
          {dl && dl.paceStatus !== "not_eligible" && (
            <div className={`rounded px-2 py-1.5 mb-2 flex items-center justify-between text-xs ${
              dl.paceStatus === "ok"
                ? "bg-emerald-50 dark:bg-emerald-950/30"
                : dl.paceStatus === "tight"
                ? "bg-amber-50 dark:bg-amber-950/30"
                : "bg-red-50 dark:bg-red-950/30"
            }`}>
              <span className={`font-medium ${
                dl.paceStatus === "ok"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : dl.paceStatus === "tight"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-red-700 dark:text-red-400"
              }`}>
                {dl.remainingObligation > 0
                  ? `期限まで${dl.daysUntilDeadline}日 / あと${dl.remainingObligation}日取得必要`
                  : `年5日義務達成済み`
                }
              </span>
              <Badge
                variant={dl.paceStatus === "danger" || dl.paceStatus === "overdue" ? "destructive" : "outline"}
                className={`text-xs px-1 py-0 ${
                  dl.paceStatus === "ok"
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : dl.paceStatus === "tight"
                    ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    : ""
                }`}
              >
                {dl.paceStatus === "ok" && "余裕あり"}
                {dl.paceStatus === "tight" && "注意"}
                {dl.paceStatus === "danger" && "危険"}
                {dl.paceStatus === "overdue" && "超過"}
              </Badge>
            </div>
          )}

          {/* Health indicators */}
          {emp.health && (
            <div className="flex flex-wrap gap-1 mb-2">
              {emp.health.expiryRisk && emp.health.expiryRisk.riskLevel !== "none" && (
                <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                  emp.health.expiryRisk.riskLevel === "high"
                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                    : emp.health.expiryRisk.riskLevel === "medium"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
                }`}>
                  失効リスク{emp.health.expiryRisk.riskLevel === "high" ? "高" : emp.health.expiryRisk.riskLevel === "medium" ? "中" : "低"}
                </span>
              )}
              {emp.health.consumptionPace && emp.health.consumptionPace.paceLevel !== "not_applicable" && emp.health.consumptionPace.paceLevel !== "good" && (
                <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                  emp.health.consumptionPace.paceLevel === "very_slow"
                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                }`}>
                  ペース{emp.health.consumptionPace.paceLevel === "very_slow" ? "不足" : "遅れ"}
                </span>
              )}
              {emp.health.carryoverUtil && emp.health.carryoverUtil.utilLevel === "danger" && (
                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400">
                  繰越未消化
                </span>
              )}
            </div>
          )}

          {/* Composite risk comment */}
          {emp.compositeRisk && emp.compositeComment && (
            <div className={`rounded-md px-3 py-2 mb-2 border ${
              emp.compositeRisk === "high"
                ? "border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950/30"
                : "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20"
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldAlert className={`h-3.5 w-3.5 ${
                  emp.compositeRisk === "high" ? "text-purple-600 dark:text-purple-400" : "text-purple-500 dark:text-purple-400"
                }`} />
                <span className={`text-xs font-semibold ${
                  emp.compositeRisk === "high" ? "text-purple-800 dark:text-purple-300" : "text-purple-700 dark:text-purple-300"
                }`}>
                  {emp.compositeRisk === "high" ? "複合リスク：高" : "複合リスク：中"}
                </span>
              </div>
              {emp.compositeComment.split("\n").map((line, i) => (
                <p key={i} className="text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* Alerts list — separated by category */}
          {leaveAlerts.length > 0 && (
            <div className="space-y-1 mb-1">
              {leaveAlerts.slice(0, 2).map((alert, i) => (
                <AlertRow key={`l-${i}`} alert={alert} />
              ))}
              {leaveAlerts.length > 2 && (
                <p className="text-xs text-muted-foreground pl-2">
                  他{leaveAlerts.length - 2}件の有給アラート
                </p>
              )}
            </div>
          )}
          {overtimeAlerts.length > 0 && (
            <div className="space-y-1 mb-1">
              {overtimeAlerts.slice(0, 2).map((alert, i) => (
                <AlertRow key={`o-${i}`} alert={alert} />
              ))}
              {overtimeAlerts.length > 2 && (
                <p className="text-xs text-muted-foreground pl-2">
                  他{overtimeAlerts.length - 2}件の残業アラート
                </p>
              )}
            </div>
          )}

          {/* Footer link hint */}
          <div className="flex items-center justify-end mt-2 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            詳細を見る
            <ChevronRight className="h-3 w-3 ml-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AlertRow({ alert }: { alert: EmployeeAlert }) {
  const colorClass =
    alert.severity === "danger"
      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
      : alert.severity === "warning"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
      : alert.severity === "caution"
      ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300"
      : alert.severity === "notice"
      ? "bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
      : alert.severity === "info"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";

  const Icon =
    alert.severity === "danger"
      ? ShieldAlert
      : alert.severity === "caution"
      ? TriangleAlert
      : alert.severity === "notice"
      ? FileText
      : alert.severity === "info"
      ? Info
      : TriangleAlert;

  return (
    <div className={`flex items-start gap-1.5 rounded px-2 py-1 text-xs ${colorClass}`}>
      <Icon className="h-3 w-3 mt-0.5 shrink-0" />
      <span className="flex-1 min-w-0 leading-tight">
        <span className="font-medium">
          {alert.category === "overtime" ? "残業" : "有給"}:
        </span>{" "}
        {alert.message}
      </span>
    </div>
  );
}
