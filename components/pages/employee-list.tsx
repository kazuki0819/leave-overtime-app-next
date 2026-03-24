"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Link from "next/link";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import {
  Search,
  UserPlus,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Users,
  UserX,
  Trash2,
  Download,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Employee, PaidLeave } from "@/lib/schema";

type SortKey = "name" | "assignment" | "joinDate" | "grantedDays" | "consumedDays" | "remainingDays" | "usageRate";
type SortDir = "asc" | "desc";

interface NewEmployeeForm {
  name: string;
  assignment: string;
  joinDate: string;
}

const defaultForm: NewEmployeeForm = {
  name: "",
  assignment: "",
  joinDate: "",
};

/** 入社日から勤続月数を自動計算（労基法の勤続年数と同じ基準：入社日から現在までの暦月数） */
function calcTenureMonths(joinDate: string): number {
  if (!joinDate) return 0;
  const join = new Date(joinDate);
  const now = new Date();
  if (isNaN(join.getTime())) return 0;
  const months = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
  // 入社日がまだ来ていない月はカウントしない
  if (now.getDate() < join.getDate()) return Math.max(0, months - 1);
  return Math.max(0, months);
}

export default function EmployeeList() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewEmployeeForm>(defaultForm);
  const [nextId, setNextId] = useState<string>("");
  const [includeRetired, setIncludeRetired] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const { toast } = useToast();

  const { data: employees, isLoading: empLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees", includeRetired],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees${includeRetired ? "?includeRetired=true" : ""}`);
      return res.json();
    },
  });

  const { fiscalYear } = useFiscalYear();

  const { data: paidLeaves } = useQuery<PaidLeave[]>({
    queryKey: ["/api/paid-leaves", fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/paid-leaves?year=${fiscalYear}`);
      return res.json();
    },
  });

  const addEmployeeMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      assignment: string;
      joinDate: string;
      tenureMonths: number;
    }) => {
      const res = await apiRequest("POST", "/api/employees", payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "社員の追加に失敗しました");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "社員を追加しました" });
      setDialogOpen(false);
      setForm(defaultForm);
      setNextId("");
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await apiRequest("DELETE", `/api/employees/${employeeId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "社員の削除に失敗しました");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "社員を削除しました" });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const id = nextId || String(Date.now());
    addEmployeeMutation.mutate({
      id,
      name: form.name.trim(),
      assignment: form.assignment.trim() || "-",
      joinDate: form.joinDate || "",
      tenureMonths: calcTenureMonths(form.joinDate),
    });
  };

  const leaveMap = useMemo(() => {
    const m = new Map<string, PaidLeave>();
    paidLeaves?.forEach((pl) => m.set(pl.employeeId, pl));
    return m;
  }, [paidLeaves]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredSorted = useMemo(() => {
    if (!employees) return [];
    let list = employees.filter((e) => {
      const q = search.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.assignment.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const plA = leaveMap.get(a.id);
      const plB = leaveMap.get(b.id);
      let valA: string | number = "";
      let valB: string | number = "";

      switch (sortKey) {
        case "name":
          valA = a.name;
          valB = b.name;
          break;
        case "assignment":
          valA = a.assignment;
          valB = b.assignment;
          break;
        case "joinDate":
          valA = a.joinDate;
          valB = b.joinDate;
          break;
        case "grantedDays":
          valA = plA?.grantedDays ?? 0;
          valB = plB?.grantedDays ?? 0;
          break;
        case "consumedDays":
          valA = plA?.consumedDays ?? 0;
          valB = plB?.consumedDays ?? 0;
          break;
        case "remainingDays":
          valA = plA?.remainingDays ?? 0;
          valB = plB?.remainingDays ?? 0;
          break;
        case "usageRate":
          valA = plA?.usageRate ?? 0;
          valB = plB?.usageRate ?? 0;
          break;
      }

      const cmp = typeof valA === "string"
        ? valA.localeCompare(valB as string, "ja")
        : (valA as number) - (valB as number);

      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [employees, search, sortKey, sortDir, leaveMap]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  const getUsageColor = (rate: number) => {
    if (rate >= 0.7) return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (rate >= 0.3) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  if (empLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold" data-testid="page-title">社員一覧</h1>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" data-testid="page-title">
          社員一覧
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {filteredSorted.length}名
            {includeRetired && employees && (
              <span className="ml-1">
                （在籍 {employees.filter(e => e.status !== "retired").length} / 退職 {employees.filter(e => e.status === "retired").length}）
              </span>
            )}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
              window.open(`${API_BASE}/api/export/employees${includeRetired ? "?includeRetired=true" : ""}`, "_blank");
            }}
            data-testid="button-export-employees"
          >
            <Download className="h-3.5 w-3.5" />
            CSVエクスポート
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const res = await apiRequest("GET", "/api/employees/next-id");
                const { nextId: nid } = await res.json();
                setNextId(nid);
              } catch { setNextId(""); }
              setForm(defaultForm);
              setDialogOpen(true);
            }}
            data-testid="button-add-employee"
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            ＋ 新規追加
          </Button>
        </div>
      </div>

      {/* 検索バー + フィルタ */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="氏名・配属先で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="include-retired"
            checked={includeRetired}
            onCheckedChange={setIncludeRetired}
            data-testid="switch-include-retired"
          />
          <Label htmlFor="include-retired" className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
            退職者を含む
          </Label>
        </div>
      </div>

      {/* テーブル */}
      <Card className="border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="employee-table">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-2.5">
                  <button
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-1 font-medium hover:text-foreground"
                    data-testid="sort-name"
                  >
                    氏名 <SortIcon col="name" />
                  </button>
                </th>
                {includeRetired && (
                  <th className="px-4 py-2.5">
                    <span className="font-medium">ステータス</span>
                  </th>
                )}
                <th className="px-4 py-2.5">
                  <button
                    onClick={() => toggleSort("assignment")}
                    className="flex items-center gap-1 font-medium hover:text-foreground"
                    data-testid="sort-assignment"
                  >
                    配属先 <SortIcon col="assignment" />
                  </button>
                </th>
                <th className="px-4 py-2.5">
                  <button
                    onClick={() => toggleSort("joinDate")}
                    className="flex items-center gap-1 font-medium hover:text-foreground"
                    data-testid="sort-joinDate"
                  >
                    入社日 <SortIcon col="joinDate" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => toggleSort("grantedDays")}
                    className="flex items-center gap-1 font-medium hover:text-foreground ml-auto"
                    data-testid="sort-grantedDays"
                  >
                    付与 <SortIcon col="grantedDays" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => toggleSort("consumedDays")}
                    className="flex items-center gap-1 font-medium hover:text-foreground ml-auto"
                    data-testid="sort-consumedDays"
                  >
                    消化 <SortIcon col="consumedDays" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => toggleSort("remainingDays")}
                    className="flex items-center gap-1 font-medium hover:text-foreground ml-auto"
                    data-testid="sort-remainingDays"
                  >
                    残日数 <SortIcon col="remainingDays" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => toggleSort("usageRate")}
                    className="flex items-center gap-1 font-medium hover:text-foreground ml-auto"
                    data-testid="sort-usageRate"
                  >
                    取得率 <SortIcon col="usageRate" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((emp) => {
                const pl = leaveMap.get(emp.id);
                const rate = pl?.usageRate ?? 0;
                const empRetired = emp.status === "retired";
                return (
                  <tr
                    key={emp.id}
                    className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${empRetired ? "opacity-60" : ""}`}
                    data-testid={`row-employee-${emp.id}`}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/employees/${emp.id}`}
                        className={`font-medium hover:underline ${empRetired ? "text-muted-foreground" : "text-primary"}`}
                        data-testid={`link-employee-${emp.id}`}
                      >
                        {emp.name}
                      </Link>
                    </td>
                    {includeRetired && (
                      <td className="px-4 py-2.5">
                        {empRetired ? (
                          <Badge variant="outline" className="text-xs border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            退職
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            在籍
                          </Badge>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-muted-foreground">{emp.assignment === "-" ? "本社" : emp.assignment}</td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{emp.joinDate || "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pl?.grantedDays ?? "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pl?.consumedDays ?? "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {pl?.remainingDays ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {pl ? (
                        <Badge
                          variant="outline"
                          className={`text-xs tabular-nums ${getUsageColor(rate)}`}
                        >
                          {(rate * 100).toFixed(0)}%
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTarget(emp);
                          setDeleteDialogOpen(true);
                        }}
                        data-testid={`button-delete-employee-${emp.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setDeleteTarget(null);
        }
      }}>
        <DialogContent data-testid="dialog-delete-employee">
          <DialogHeader>
            <DialogTitle>社員の削除</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                deleteTarget.status === "retired" ? (
                  `「${deleteTarget.name}」を削除しますか？この操作は元に戻せません。`
                ) : (
                  `「${deleteTarget.name}」は在籍中の社員です。本当に削除しますか？関連する有給・残業データも削除されます。`
                )
              ) : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && deleteTarget.status !== "retired" && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2.5 text-sm text-red-800 dark:text-red-300">
              <div className="flex items-start gap-2">
                <Trash2 className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">警告</p>
                  <p className="mt-1 text-xs">在籍中の社員です。本当に削除しますか？関連する有給・残業データも削除されます</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteTarget(null);
              }}
              data-testid="button-cancel-delete-employee"
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteEmployeeMutation.mutate(deleteTarget.id)}
              disabled={deleteEmployeeMutation.isPending || !deleteTarget}
              data-testid="button-confirm-delete-employee"
            >
              {deleteEmployeeMutation.isPending ? "削除中..." : "削除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新規追加ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="dialog-add-employee">
          <DialogHeader>
            <DialogTitle>社員新規追加</DialogTitle>
            <DialogDescription>
              新しい社員の情報を入力してください。＊は必須項目です。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* 社員番号（自動付与） */}
            <div className="space-y-1.5">
              <Label>社員番号</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={nextId}
                  readOnly
                  className="w-24 bg-muted text-center font-mono"
                  data-testid="input-new-employee-id"
                />
                <span className="text-xs text-muted-foreground">自動付与</span>
              </div>
            </div>

            {/* 氏名 */}
            <div className="space-y-1.5">
              <Label htmlFor="new-employee-name">
                氏名 <span className="text-destructive">＊</span>
              </Label>
              <Input
                id="new-employee-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例: 山田 太郎"
                required
                autoFocus
                data-testid="input-new-employee-name"
              />
            </div>

            {/* 配属先 */}
            <div className="space-y-1.5">
              <Label htmlFor="new-employee-assignment">配属先</Label>
              <Input
                id="new-employee-assignment"
                value={form.assignment}
                onChange={(e) => setForm((f) => ({ ...f, assignment: e.target.value }))}
                placeholder="空欄の場合は本社（-）"
                data-testid="input-new-employee-assignment"
              />
              <p className="text-xs text-muted-foreground">空欄の場合、本社（-）が自動設定されます</p>
            </div>

            {/* 入社日 */}
            <div className="space-y-1.5">
              <Label htmlFor="new-employee-joinDate">
                入社日 <span className="text-destructive">＊</span>
              </Label>
              <Input
                id="new-employee-joinDate"
                type="date"
                value={form.joinDate}
                onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))}
                required
                data-testid="input-new-employee-joinDate"
              />
            </div>

            {/* 勤続月数（自動計算・読み取り専用） */}
            <div className="space-y-1.5">
              <Label>勤続月数</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.joinDate ? `${calcTenureMonths(form.joinDate)}ヶ月` : "―"}
                  readOnly
                  className="w-24 bg-muted text-center"
                  data-testid="input-new-employee-tenureMonths"
                />
                <span className="text-xs text-muted-foreground">入社日から自動計算</span>
              </div>
              {form.joinDate && (
                <p className="text-xs text-muted-foreground">
                  勤続年数: {(calcTenureMonths(form.joinDate) / 12).toFixed(1)}年
                  （有給付与日数の算出に使用）
                </p>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setForm(defaultForm);
                  setNextId("");
                }}
                data-testid="button-cancel-add-employee"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={addEmployeeMutation.isPending || !form.name.trim() || !form.joinDate}
                data-testid="button-submit-add-employee"
              >
                {addEmployeeMutation.isPending ? "追加中..." : "追加"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
