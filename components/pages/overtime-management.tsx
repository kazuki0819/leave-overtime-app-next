"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Link from "next/link";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";
import {
  Clock,
  Search,
  ShieldAlert,
  TriangleAlert,
  ArrowUpDown,
  Filter,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Timer,
  Users,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import type { EmployeeAlert, MonthlyOvertime } from "@/lib/schema";
import type { LeaveDeadlineInfo } from "@/lib/leave-calc";

type EmployeeSummary = {
  id: string;
  name: string;
  assignment: string;
  paidLeave: {
    consumedDays: number;
    remainingDays: number;
    totalAvailable: number;
    usageRate: number;
  } | null;
  overtime: {
    yearlyTotal: number;
    monthlyData: MonthlyOvertime[];
  };
  deadline: LeaveDeadlineInfo;
  alerts: EmployeeAlert[];
  dangerCount: number;
  warningCount: number;
  alertCount: number;
};

type DashboardData = {
  totalEmployees: number;
  monthlyOvertimeAggregated: Array<{
    month: number;
    totalHours: number;
    avgHours: number;
    count: number;
  }>;
};

type SortKey = "name" | "yearlyTotal" | "maxMonth" | "over45count" | "avgMonth";
type SortDir = "asc" | "desc";
type OTFilter = "all" | "danger" | "warning" | "over360" | "over45" | "clear";

const MONTHS_FY = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const MONTH_LABELS = MONTHS_FY.map((m) => `${m}月`);

export default function OvertimeManagement() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OTFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("yearlyTotal");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { fiscalYear } = useFiscalYear();

  const { data: summaries, isLoading: sumLoading } = useQuery<EmployeeSummary[]>({
    queryKey: ["/api/employee-summaries", fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employee-summaries?year=${fiscalYear}`);
      return res.json();
    },
  });

  const { data: dashData, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard", fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/dashboard?year=${fiscalYear}`);
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

  // Derived per-employee overtime stats
  const enriched = useMemo(() => {
    if (!summaries) return [];
    return summaries.map((emp) => {
      const monthMap = new Map(emp.overtime.monthlyData.map((o) => [o.month, o]));
      const monthlyHours = MONTHS_FY.map((m) => monthMap.get(m)?.overtimeHours ?? 0);
      const maxMonth = Math.max(...monthlyHours, 0);
      const over45count = emp.overtime.monthlyData.filter((o) => o.overtimeHours > 45).length;
      const dataMonths = emp.overtime.monthlyData.length;
      const avgMonth = dataMonths > 0 ? emp.overtime.yearlyTotal / dataMonths : 0;
      return { ...emp, monthlyHours, maxMonth, over45count, avgMonth, monthMap };
    });
  }, [summaries]);

  const filtered = useMemo(() => {
    let list = [...enriched];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.assignment.toLowerCase().includes(q)
      );
    }

    const otAlerts = (e: typeof enriched[number]) =>
      e.alerts.filter((a) => a.category === "overtime");

    switch (filter) {
      case "danger":
        list = list.filter((e) => otAlerts(e).some((a) => a.severity === "danger"));
        break;
      case "warning":
        list = list.filter((e) => otAlerts(e).some((a) => a.severity === "warning") && !otAlerts(e).some((a) => a.severity === "danger"));
        break;
      case "over360":
        list = list.filter((e) => e.overtime.yearlyTotal > 360);
        break;
      case "over45":
        list = list.filter((e) => e.over45count > 0);
        break;
      case "clear":
        list = list.filter((e) => otAlerts(e).length === 0);
        break;
    }

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name, "ja");
        case "yearlyTotal":
          return dir * (a.overtime.yearlyTotal - b.overtime.yearlyTotal);
        case "maxMonth":
          return dir * (a.maxMonth - b.maxMonth);
        case "over45count":
          return dir * (a.over45count - b.over45count);
        case "avgMonth":
          return dir * (a.avgMonth - b.avgMonth);
        default:
          return 0;
      }
    });

    return list;
  }, [enriched, search, filter, sortKey, sortDir]);

  const isLoading = sumLoading || dashLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold" data-testid="page-title">残業管理</h1>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  if (!summaries || !dashData) return null;

  // KPI
  const over360 = enriched.filter((e) => e.overtime.yearlyTotal > 360);
  const over45any = enriched.filter((e) => e.over45count > 0);
  const otAlertEmps = enriched.filter((e) =>
    e.alerts.some((a) => a.category === "overtime")
  );
  const otDangerEmps = enriched.filter((e) =>
    e.alerts.some((a) => a.category === "overtime" && a.severity === "danger")
  );
  const avgYearly =
    enriched.length > 0
      ? enriched.reduce((s, e) => s + e.overtime.yearlyTotal, 0) / enriched.length
      : 0;

  // Monthly aggregated bar data
  const monthlyAgg = dashData.monthlyOvertimeAggregated;
  const maxMonthlyTotal = Math.max(...monthlyAgg.map((m) => m.avgHours), 1);

  const filterButtons: { key: OTFilter; label: string; count: number }[] = [
    { key: "all", label: "全員", count: enriched.length },
    { key: "danger", label: "違反", count: otDangerEmps.length },
    { key: "warning", label: "警告", count: otAlertEmps.length - otDangerEmps.length },
    { key: "over360", label: "360h超", count: over360.length },
    { key: "over45", label: "45h超月あり", count: over45any.length },
    { key: "clear", label: "問題なし", count: enriched.length - otAlertEmps.length },
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
        <h1 className="text-xl font-bold" data-testid="page-title">残業管理</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
              window.open(`${API_BASE}/api/export/overtime-management?year=${fiscalYear}`, "_blank");
            }}
            data-testid="button-export-overtime"
          >
            <Download className="h-3.5 w-3.5" />
            CSVエクスポート
          </Button>
          <FiscalYearSelector />
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">360h超過</p>
                <p className={`text-lg font-bold mt-0.5 ${over360.length > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {over360.length}名
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
                <p className="text-xs font-medium text-muted-foreground">45h超月あり</p>
                <p className={`text-lg font-bold mt-0.5 ${over45any.length > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {over45any.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/40">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">平均年間残業</p>
                <p className={`text-lg font-bold mt-0.5 tabular-nums ${avgYearly > 360 ? "text-red-600 dark:text-red-400" : avgYearly > 300 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {avgYearly.toFixed(2)}h
                </p>
              </div>
              <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/40">
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">残業アラート</p>
                <p className={`text-lg font-bold mt-0.5 ${otAlertEmps.length > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {otAlertEmps.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/40">
                <TriangleAlert className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">問題なし</p>
                <p className="text-lg font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {enriched.length - otAlertEmps.length}名
                </p>
              </div>
              <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/40">
                <Users className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly aggregated bar chart */}
      <Card className="border">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-4 w-4 text-blue-500" />
            月別平均残業時間（全社）
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-end gap-1.5 h-28">
            {MONTHS_FY.map((m) => {
              const agg = monthlyAgg.find((a) => a.month === m);
              const avg = agg?.avgHours ?? 0;
              const barHeight = maxMonthlyTotal > 0 ? (avg / maxMonthlyTotal) * 100 : 0;
              const isOver45 = avg > 45;
              const isWarn = avg > 35 && avg <= 45;
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {avg > 0 ? avg.toFixed(2) : ""}
                  </span>
                  <div className="w-full flex justify-center">
                    <div
                      className={`w-full max-w-[32px] rounded-t transition-all ${
                        isOver45
                          ? "bg-red-400 dark:bg-red-500"
                          : isWarn
                          ? "bg-amber-400 dark:bg-amber-500"
                          : "bg-blue-400 dark:bg-blue-500"
                      }`}
                      style={{ height: `${Math.max(barHeight, 2)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{m}月</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-400" />
              違反（45h超）
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              警告（35-45h）
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              適正（35h以下）
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="氏名・配属先で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
            data-testid="input-search-overtime"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {filterButtons.map((fb) => (
            <Button
              key={fb.key}
              variant={filter === fb.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => setFilter(fb.key)}
              data-testid={`filter-ot-${fb.key}`}
            >
              {fb.label}
              <span className="ml-1 opacity-70">{fb.count}</span>
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length}名表示中</p>

      {/* Table */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="overtime-table">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium sticky left-0 bg-muted/30 z-10">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("name")}>
                      氏名 <SortIcon col="name" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">配属先</th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("yearlyTotal")}>
                      年間合計 <SortIcon col="yearlyTotal" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("avgMonth")}>
                      月平均 <SortIcon col="avgMonth" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("maxMonth")}>
                      最大月 <SortIcon col="maxMonth" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("over45count")}>
                      45h超回数 <SortIcon col="over45count" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium text-center">360h進捗</th>
                  {/* Monthly mini bars */}
                  {MONTHS_FY.map((m) => (
                    <th key={m} className="px-1 py-2.5 font-medium text-center text-xs w-8">
                      {m}月
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-medium">アラート</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const otAlerts = emp.alerts.filter((a) => a.category === "overtime");
                  const hasDanger = otAlerts.some((a) => a.severity === "danger");
                  const yearlyPct = Math.min(100, (emp.overtime.yearlyTotal / 360) * 100);

                  return (
                    <tr
                      key={emp.id}
                      className={`border-b hover:bg-muted/20 transition-colors ${hasDanger ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}
                      data-testid={`row-ot-${emp.id}`}
                    >
                      <td className="px-3 py-2 sticky left-0 bg-background z-10">
                        <Link
                          href={`/employees/${emp.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {emp.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{emp.assignment}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span
                          className={`font-semibold ${
                            emp.overtime.yearlyTotal > 360
                              ? "text-red-600 dark:text-red-400"
                              : emp.overtime.yearlyTotal > 300
                              ? "text-amber-600 dark:text-amber-400"
                              : ""
                          }`}
                        >
                          {emp.overtime.yearlyTotal.toFixed(2)}h
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {emp.avgMonth.toFixed(2)}h
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={`font-medium ${emp.maxMonth > 45 ? "text-red-600 dark:text-red-400" : emp.maxMonth > 35 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                          {emp.maxMonth.toFixed(2)}h
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {emp.over45count > 0 ? (
                          <Badge variant="destructive" className="text-xs px-1.5 py-0">
                            {emp.over45count}回
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                emp.overtime.yearlyTotal > 360
                                  ? "bg-red-500"
                                  : emp.overtime.yearlyTotal > 300
                                  ? "bg-amber-500"
                                  : "bg-blue-500"
                              }`}
                              style={{ width: `${yearlyPct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                            {yearlyPct.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                      {/* Monthly mini heat cells */}
                      {MONTHS_FY.map((m, idx) => {
                        const hours = emp.monthlyHours[idx];
                        const bg =
                          hours > 45
                            ? "bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-300"
                            : hours > 35
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
                            : hours > 0
                            ? "bg-blue-50 dark:bg-blue-950/30 text-foreground"
                            : "text-muted-foreground/50";
                        return (
                          <td key={m} className={`px-0.5 py-2 text-center text-xs tabular-nums ${bg}`}>
                            {hours > 0 ? hours.toFixed(2) : "-"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        {otAlerts.length > 0 ? (
                          <div className="space-y-0.5">
                            {otAlerts.slice(0, 1).map((a, i) => (
                              <div key={i} className="flex items-center gap-1 text-xs">
                                {a.severity === "danger" ? (
                                  <ShieldAlert className="h-3 w-3 text-red-500 shrink-0" />
                                ) : (
                                  <TriangleAlert className="h-3 w-3 text-amber-500 shrink-0" />
                                )}
                                <span className={`truncate max-w-[140px] ${a.severity === "danger" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                                  {a.message}
                                </span>
                              </div>
                            ))}
                            {otAlerts.length > 1 && (
                              <span className="text-xs text-muted-foreground">他{otAlerts.length - 1}件</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">問題なし</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
