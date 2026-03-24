"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import {
  CalendarCog,
  ArrowRightLeft,
  Database,
  Download,
  HardDrive,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

// ── 型定義 ──

type TransitionPreviewEmployee = {
  employeeId: string;
  name: string;
  joinDate: string;
  prevGranted: number;
  prevConsumed: number;
  prevRemaining: number;
  newGranted: number;
  newCarryover: number;
  newTotal: number;
  alreadyExists: boolean;
};

type TransitionPreview = {
  targetFiscalYear: number;
  previousFiscalYear: number;
  totalEmployees: number;
  alreadyTransitioned: number;
  toBeCreated: number;
  employees: TransitionPreviewEmployee[];
};

type BackupInfo = {
  dbPath: string;
  dbSize: number;
  lastModified: string;
  backupDir: string;
  backups: { filename: string; date: string; size: number }[];
};

type TransitionResult = {
  targetFiscalYear: number;
  previousFiscalYear: number;
  totalEmployees: number;
  created: number;
  skipped: number;
  details: { employeeId: string; name: string; granted: number; carryover: number; status: string }[];
};

// ── メインコンポーネント ──

export default function Settings() {
  const { fiscalYear, fiscalYearOptions } = useFiscalYear();
  const [targetYear, setTargetYear] = useState<number>(fiscalYear + 1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [transitionResult, setTransitionResult] = useState<TransitionResult | null>(null);
  const { toast } = useToast();

  // ── バックアップ情報取得 ──
  const { data: backupInfo, isLoading: backupLoading } = useQuery<BackupInfo>({
    queryKey: ["/api/backup/info"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/backup/info");
      return res.json();
    },
  });

  // ── 年度切替プレビュー ──
  const { data: preview, isLoading: previewLoading, refetch: fetchPreview } = useQuery<TransitionPreview>({
    queryKey: ["/api/fiscal-year-transition/preview", targetYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/fiscal-year-transition/preview?year=${targetYear}`);
      return res.json();
    },
    enabled: previewOpen,
  });

  // ── バックアップ作成 ──
  const backupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backup/create");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "バックアップ完了",
        description: `${data.filename} を作成しました（${formatBytes(data.size)}）`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/backup/info"] });
    },
    onError: (e) => {
      toast({ title: "バックアップ失敗", description: String(e), variant: "destructive" });
    },
  });

  // ── 年度切替実行 ──
  const transitionMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await apiRequest("POST", "/api/fiscal-year-transition", { targetFiscalYear: year });
      return res.json() as Promise<TransitionResult>;
    },
    onSuccess: (data) => {
      setTransitionResult(data);
      setPreviewOpen(false);
      setResultOpen(true);
      toast({
        title: "年度切替完了",
        description: `${data.targetFiscalYear}年度: ${data.created}名分を新規作成、${data.skipped}名スキップ`,
      });
      // キャッシュを全クリア（年度データが変わるため）
      queryClient.invalidateQueries();
    },
    onError: (e) => {
      toast({ title: "年度切替失敗", description: String(e), variant: "destructive" });
    },
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" data-testid="page-title">設定</h1>

      {/* ── 年度切替セクション ── */}
      <Card className="border" data-testid="section-year-transition">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
            年度切替
          </CardTitle>
          <CardDescription className="text-xs">
            前年度の残日数を繰越日数として計算し、新年度の有給レコードを一括作成します。
            実行前にプレビューで内容を確認できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">対象年度:</label>
            <Select
              value={String(targetYear)}
              onValueChange={(v) => setTargetYear(parseInt(v, 10))}
            >
              <SelectTrigger className="w-[140px] h-9" data-testid="select-target-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fiscalYearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}年度
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setPreviewOpen(true);
                fetchPreview();
              }}
              data-testid="button-preview-transition"
            >
              <CalendarCog className="h-4 w-4 mr-1.5" />
              プレビュー
            </Button>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>年度切替ロジック:</span>
            </div>
            <ul className="ml-5 list-disc space-y-0.5">
              <li>新年度の付与日数は入社日から自動計算（労基法基準）</li>
              <li>前年度の残日数 → 新年度の繰越日数（上限なし）</li>
              <li>消化日数は0日、時効は年度末に確定</li>
              <li>既に新年度データがある社員はスキップされます</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ── バックアップセクション ── */}
      <Card className="border" data-testid="section-backup">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-4 w-4 text-emerald-500" />
            データベースバックアップ
          </CardTitle>
          <CardDescription className="text-xs">
            SQLiteデータベースのバックアップを手動で作成できます。最新30件を保持します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backupLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : backupInfo ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">データベースパス</p>
                  <p className="font-mono text-xs break-all mt-0.5">{backupInfo.dbPath}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">サイズ / 最終更新</p>
                  <p className="text-xs mt-0.5">
                    {formatBytes(backupInfo.dbSize)} / {formatDate(backupInfo.lastModified)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => backupMutation.mutate()}
                  disabled={backupMutation.isPending}
                  data-testid="button-create-backup"
                >
                  {backupMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <HardDrive className="h-4 w-4" />
                  )}
                  今すぐバックアップ
                </Button>
                <span className="text-xs text-muted-foreground">
                  保存先: {backupInfo.backupDir}
                </span>
              </div>

              {/* バックアップ一覧 */}
              {backupInfo.backups.length > 0 && (
                <div className="rounded-md border">
                  <table className="w-full text-sm" data-testid="backup-table">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium text-xs">ファイル名</th>
                        <th className="px-3 py-2 font-medium text-xs">作成日時</th>
                        <th className="px-3 py-2 font-medium text-xs text-right">サイズ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupInfo.backups.map((b) => (
                        <tr key={b.filename} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono text-xs">{b.filename}</td>
                          <td className="px-3 py-1.5 text-xs">{formatDate(b.date)}</td>
                          <td className="px-3 py-1.5 text-xs text-right tabular-nums">{formatBytes(b.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ── プレビューダイアログ ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-500" />
              年度切替プレビュー — {targetYear}年度
            </DialogTitle>
            <DialogDescription>
              {targetYear - 1}年度 → {targetYear}年度 への切替内容を確認してください。
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : preview ? (
            <div className="flex-1 overflow-hidden flex flex-col gap-3">
              {/* サマリー */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">対象社員</p>
                  <p className="text-lg font-bold">{preview.totalEmployees}名</p>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">新規作成</p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {preview.toBeCreated}名
                  </p>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">スキップ（既存）</p>
                  <p className="text-lg font-bold text-muted-foreground">
                    {preview.alreadyTransitioned}名
                  </p>
                </div>
              </div>

              {preview.alreadyTransitioned > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    既に{preview.alreadyTransitioned}名分の{targetYear}年度データが存在するためスキップされます。
                  </span>
                </div>
              )}

              {/* 社員リスト */}
              <div className="flex-1 overflow-auto border rounded-md">
                <table className="w-full text-sm" data-testid="preview-table">
                  <thead className="sticky top-0">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium text-xs">社員番号</th>
                      <th className="px-3 py-2 font-medium text-xs">氏名</th>
                      <th className="px-3 py-2 font-medium text-xs text-right">前年度残日数</th>
                      <th className="px-3 py-2 font-medium text-xs text-right">新年度付与</th>
                      <th className="px-3 py-2 font-medium text-xs text-right">繰越日数</th>
                      <th className="px-3 py-2 font-medium text-xs text-right">合計</th>
                      <th className="px-3 py-2 font-medium text-xs text-center">ステータス</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.employees.map((emp) => (
                      <tr
                        key={emp.employeeId}
                        className={`border-b last:border-0 hover:bg-muted/20 ${emp.alreadyExists ? "opacity-50" : ""}`}
                      >
                        <td className="px-3 py-1.5 text-xs tabular-nums">{emp.employeeId}</td>
                        <td className="px-3 py-1.5 text-xs font-medium">{emp.name}</td>
                        <td className="px-3 py-1.5 text-xs text-right tabular-nums">{emp.prevRemaining}</td>
                        <td className="px-3 py-1.5 text-xs text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                          {emp.newGranted}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-right tabular-nums">
                          {emp.newCarryover > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">{emp.newCarryover}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-right tabular-nums font-bold">{emp.newTotal}</td>
                        <td className="px-3 py-1.5 text-center">
                          {emp.alreadyExists ? (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">既存</Badge>
                          ) : (
                            <Badge className="text-xs px-1.5 py-0 bg-blue-600">新規</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => transitionMutation.mutate(targetYear)}
              disabled={transitionMutation.isPending || (preview?.toBeCreated === 0)}
              className="gap-1.5"
              data-testid="button-execute-transition"
            >
              {transitionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              {targetYear}年度に切替実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 結果ダイアログ ── */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              年度切替完了
            </DialogTitle>
            {transitionResult && (
              <DialogDescription>
                {transitionResult.targetFiscalYear}年度への切替が完了しました。
              </DialogDescription>
            )}
          </DialogHeader>

          {transitionResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">対象社員</p>
                  <p className="text-lg font-bold">{transitionResult.totalEmployees}名</p>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">新規作成</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {transitionResult.created}名
                  </p>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">スキップ</p>
                  <p className="text-lg font-bold text-muted-foreground">
                    {transitionResult.skipped}名
                  </p>
                </div>
              </div>

              <div className="max-h-60 overflow-auto rounded-md border">
                <table className="w-full text-sm" data-testid="result-table">
                  <thead className="sticky top-0">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium text-xs">社員番号</th>
                      <th className="px-3 py-2 font-medium text-xs">氏名</th>
                      <th className="px-3 py-2 font-medium text-xs text-right">付与</th>
                      <th className="px-3 py-2 font-medium text-xs text-right">繰越</th>
                      <th className="px-3 py-2 font-medium text-xs text-center">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transitionResult.details.map((d) => (
                      <tr key={d.employeeId} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-xs tabular-nums">{d.employeeId}</td>
                        <td className="px-3 py-1.5 text-xs font-medium">{d.name}</td>
                        <td className="px-3 py-1.5 text-xs text-right tabular-nums">{d.granted}</td>
                        <td className="px-3 py-1.5 text-xs text-right tabular-nums">{d.carryover}</td>
                        <td className="px-3 py-1.5 text-center">
                          {d.status === "新規作成" ? (
                            <Badge className="text-xs px-1.5 py-0 bg-emerald-600">新規作成</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">スキップ</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setResultOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PerplexityAttribution />
    </div>
  );
}
