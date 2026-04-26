"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Users,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Timer,
  CalendarDays,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type GrantCycleEmployee = {
  id: string;
  name: string;
  assignment: string;
  isRetired: boolean;
  retiredDate: string | null;
  grantDate: string;
  grantedDays: number;
  carriedOverDays: number;
  consumedDays: number;
  remainingDays: number;
  expiredDays: number;
  usageRate: number;
  achieved5Days: boolean;
};

type GrantCycleReviewResponse = {
  year: number;
  month: number;
  totalCount: number;
  employees: GrantCycleEmployee[];
};

type SortKey = "name" | "remainingDays" | "usageRate" | "achieved5Days" | null;
type SortOrder = "asc" | "desc" | null;

export default function GrantCycleReview() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const now = new Date();
  const initialYear = parseInt(
    searchParams.get("year") ?? String(now.getFullYear()),
  );
  const initialMonth = parseInt(
    searchParams.get("month") ?? String(now.getMonth() + 1),
  );

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);

  const { data, isLoading, isError, error, refetch } =
    useQuery<GrantCycleReviewResponse>({
      queryKey: ["/api/grant-cycle-review", year, month],
      queryFn: async () => {
        const res = await apiRequest(
          "GET",
          `/api/grant-cycle-review?year=${year}&month=${month}`,
        );
        return res.json();
      },
    });

  const stats = useMemo(() => {
    if (!data || data.employees.length === 0) return null;
    const emps = data.employees;
    const total = emps.length;
    const achieved5 = emps.filter((e) => e.achieved5Days).length;
    const expiredCount = emps.filter((e) => e.expiredDays > 0).length;
    const avgUsageRate = Math.round(
      emps.reduce((sum, e) => sum + e.usageRate, 0) / total,
    );
    const avgRemaining =
      Math.round(
        (emps.reduce((sum, e) => sum + e.remainingDays, 0) / total) * 10,
      ) / 10;
    return {
      total,
      achieved5,
      achieved5Rate: Math.round((achieved5 / total) * 100),
      expiredCount,
      avgUsageRate,
      avgRemaining,
    };
  }, [data]);

  const sortedEmployees = useMemo(() => {
    if (!data?.employees) return [];
    if (!sortKey || !sortOrder) return data.employees;
    return [...data.employees].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      let cmp = 0;
      if (typeof aVal === "string") cmp = aVal.localeCompare(bVal as string, "ja");
      else if (typeof aVal === "boolean") cmp = aVal === bVal ? 0 : aVal ? -1 : 1;
      else cmp = (aVal as number) - (bVal as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortOrder("asc");
    } else if (sortOrder === "asc") {
      setSortOrder("desc");
    } else {
      setSortKey(null);
      setSortOrder(null);
    }
  };

  const handleYearChange = (val: string) => {
    const y = parseInt(val);
    setYear(y);
    router.replace(`/grant-cycle-review?year=${y}&month=${month}`);
  };

  const handleMonthChange = (val: string) => {
    const m = parseInt(val);
    setMonth(m);
    router.replace(`/grant-cycle-review?year=${year}&month=${m}`);
  };

  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column)
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">有給サイクル集計</h1>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => window.open(`/api/export/grant-cycle-review?year=${year}&month=${month}`, "_blank")}
            variant="outline"
          >
            <Download className="mr-2 h-4 w-4" />
            CSV出力
          </Button>
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="border">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-6 w-12" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border">
            <Table>
              <TableHeader>
                <TableRow>
                  {[...Array(10)].map((_, i) => (
                    <TableHead key={i}>
                      <Skeleton className="h-4 w-full" />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(10)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <p className="text-lg font-medium mb-2">データの取得に失敗しました</p>
          <p className="text-sm text-muted-foreground mb-4">
            {error instanceof Error ? error.message : "不明なエラー"}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            再試行
          </Button>
        </div>
      ) : data && data.totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">該当データがありません</p>
          <p className="text-sm text-muted-foreground">
            指定された年月（{year}年{month}月）に付与実績のある社員はいません
          </p>
        </div>
      ) : data ? (
        <>
          {stats && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <Card className="border">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        対象社員数
                      </p>
                      <p className="text-lg font-bold mt-0.5">
                        {stats.total}
                        <span className="text-xs text-muted-foreground ml-1">
                          名
                        </span>
                      </p>
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
                      <p className="text-xs font-medium text-muted-foreground">
                        年5日達成
                      </p>
                      <p className="text-lg font-bold mt-0.5">
                        {stats.achieved5}
                        <span className="text-xs text-muted-foreground mx-1">
                          /
                        </span>
                        {stats.total}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stats.achieved5Rate}%
                      </p>
                    </div>
                    <div
                      className={`rounded-lg p-2 ${stats.achieved5Rate >= 80 ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}
                    >
                      <CheckCircle2
                        className={`h-4 w-4 ${stats.achieved5Rate >= 80 ? "text-emerald-500" : "text-amber-500"}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        平均取得率
                      </p>
                      <p className="text-lg font-bold mt-0.5">
                        {stats.avgUsageRate}%
                      </p>
                    </div>
                    <div
                      className={`rounded-lg p-2 ${stats.avgUsageRate >= 50 ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}
                    >
                      <TrendingUp
                        className={`h-4 w-4 ${stats.avgUsageRate >= 50 ? "text-emerald-500" : "text-amber-500"}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`border ${stats.expiredCount > 0 ? "border-red-300 dark:border-red-800" : ""}`}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        時効発生者数
                      </p>
                      <p className="text-lg font-bold mt-0.5">
                        <span
                          className={
                            stats.expiredCount > 0
                              ? "text-red-600"
                              : "text-emerald-500"
                          }
                        >
                          {stats.expiredCount}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          名
                        </span>
                      </p>
                    </div>
                    <div
                      className={`rounded-lg p-2 ${stats.expiredCount > 0 ? "bg-red-50 dark:bg-red-950/40" : "bg-emerald-50 dark:bg-emerald-950/40"}`}
                    >
                      <Timer
                        className={`h-4 w-4 ${stats.expiredCount > 0 ? "text-red-500" : "text-emerald-500"}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        平均残日数
                      </p>
                      <p className="text-lg font-bold mt-0.5">
                        {stats.avgRemaining}
                        <span className="text-xs text-muted-foreground ml-1">
                          日
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/40">
                      <CalendarDays className="h-4 w-4 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">社員ID</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort("name")}
                    >
                      氏名
                      <SortIcon column="name" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[8rem]">
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort("remainingDays")}
                    >
                      残日数
                      <SortIcon column="remainingDays" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort("usageRate")}
                    >
                      取得率
                      <SortIcon column="usageRate" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort("achieved5Days")}
                    >
                      5日達成
                      <SortIcon column="achieved5Days" />
                    </button>
                  </TableHead>
                  <TableHead>付与</TableHead>
                  <TableHead>繰越</TableHead>
                  <TableHead>消化</TableHead>
                  <TableHead>時効</TableHead>
                  <TableHead>配属先</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEmployees.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className={!emp.achieved5Days ? "bg-red-50 dark:bg-red-950/20" : ""}
                  >
                    <TableCell className="font-mono text-xs">
                      {emp.id}
                    </TableCell>
                    <TableCell>
                      {emp.name}
                      {emp.isRetired && (
                        <Badge
                          variant="secondary"
                          className="ml-2 text-xs"
                        >
                          退職
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={`font-bold ${emp.remainingDays >= 10 ? "text-green-600" : ""}`}
                    >
                      {emp.remainingDays}日
                    </TableCell>
                    <TableCell
                      className={
                        emp.usageRate >= 80
                          ? "text-green-600"
                          : emp.usageRate <= 49
                            ? "text-red-600"
                            : ""
                      }
                    >
                      {emp.usageRate}%
                    </TableCell>
                    <TableCell>
                      {emp.achieved5Days ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell>{emp.grantedDays}</TableCell>
                    <TableCell>{emp.carriedOverDays}</TableCell>
                    <TableCell>{emp.consumedDays}</TableCell>
                    <TableCell
                      className={
                        emp.expiredDays > 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }
                    >
                      {emp.expiredDays}
                    </TableCell>
                    <TableCell>{emp.assignment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
