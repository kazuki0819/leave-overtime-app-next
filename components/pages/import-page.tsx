"use client";

import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import * as XLSX from "xlsx";
import {
  Upload,
  FileJson,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type Employee = {
  id: string;
  name: string;
  assignment?: string;
  joinDate?: string;
  tenureMonths?: number;
};

type PaidLeave = {
  employeeId: string;
  fiscalYear: number;
  grantedDays: number;
  carriedOverDays: number;
  consumedDays: number;
  remainingDays: number;
  expiredDays: number;
  usageRate: number;
};

type Overtime = {
  employeeId: string;
  year: number;
  month: number;
  overtimeHours: number;
  lateNightOvertime: number;
};

type ParsedData = {
  employees: Employee[];
  paidLeaves: PaidLeave[];
  overtimes: Overtime[];
};

type FileType = "json" | "xlsx" | null;

type ImportResult = {
  employees: {
    added: number;
    updated: number;
    skipped: number;
    skippedNames: string[];
  };
  paidLeaves: {
    imported: number;
    skipped: number;
  };
};

type OvertimeImportResult = {
  importedOvertimes: number;
  skipped: number;
  skippedReasons: string[];
};

// ─── Column mapping helpers ───────────────────────────────────────────────────

function normalizeHeader(h: unknown): string {
  return String(h ?? "").trim();
}

function pickValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
    // case-insensitive fallback
    const found = Object.keys(row).find(
      (rk) => rk.trim().toLowerCase() === k.toLowerCase()
    );
    if (found !== undefined) return row[found];
  }
  return undefined;
}

function toStr(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

// ─── Sheet → typed rows ───────────────────────────────────────────────────────

function sheetToRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return raw;
}

function parseEmployeesSheet(sheet: XLSX.WorkSheet): Employee[] {
  return sheetToRows(sheet).map((row) => ({
    id: toStr(pickValue(row, "ID", "社員番号", "id")),
    name: toStr(pickValue(row, "氏名", "名前", "name")),
    assignment: toStr(pickValue(row, "配属先", "assignment")) || undefined,
    joinDate: toStr(pickValue(row, "入社日", "joinDate")) || undefined,
    tenureMonths:
      pickValue(row, "勤続月数", "tenureMonths") !== ""
        ? toNum(pickValue(row, "勤続月数", "tenureMonths"))
        : undefined,
  }));
}

function parsePaidLeavesSheet(sheet: XLSX.WorkSheet): PaidLeave[] {
  return sheetToRows(sheet).map((row) => ({
    employeeId: toStr(pickValue(row, "社員ID", "employeeId")),
    fiscalYear: toNum(pickValue(row, "年度", "fiscalYear"), 2025),
    grantedDays: toNum(pickValue(row, "付与日数", "grantedDays")),
    carriedOverDays: toNum(pickValue(row, "繰越日数", "carriedOverDays")),
    consumedDays: toNum(pickValue(row, "消化日数", "consumedDays")),
    remainingDays: toNum(pickValue(row, "残日数", "remainingDays")),
    expiredDays: toNum(pickValue(row, "失効日数", "expiredDays")),
    usageRate: toNum(pickValue(row, "取得率", "usageRate")),
  }));
}

function parseOvertimesSheet(sheet: XLSX.WorkSheet): Overtime[] {
  return sheetToRows(sheet).map((row) => ({
    employeeId: toStr(pickValue(row, "社員ID", "employeeId")),
    year: toNum(pickValue(row, "年", "year"), 2025),
    month: toNum(pickValue(row, "月", "month")),
    overtimeHours: toNum(pickValue(row, "残業時間", "overtimeHours")),
    lateNightOvertime: toNum(
      pickValue(row, "深夜残業", "lateNightOvertime"),
      0
    ),
  }));
}

// ─── Sheet name classification ────────────────────────────────────────────────

type SheetKind = "employees" | "paidLeaves" | "overtimes" | "unknown";

function classifySheetName(name: string): SheetKind {
  const n = name.toLowerCase();
  if (n.includes("社員") || n.includes("employees")) return "employees";
  if (n.includes("有給") || n.includes("paidleaves") || n.includes("paid_leaves"))
    return "paidLeaves";
  if (
    n.includes("残業") ||
    n.includes("overtime") ||
    n.includes("monthlyovertimes")
  )
    return "overtimes";
  return "unknown";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<FileType>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  // For JSON, we store the raw object to POST as-is
  const [jsonRaw, setJsonRaw] = useState<unknown>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [overtimeResult, setOvertimeResult] = useState<OvertimeImportResult | null>(null);

  // ── Mutation: POST /api/import (employees + paidLeaves) ──────────────────
  const importMutation = useMutation({
    mutationFn: async (data: unknown): Promise<ImportResult> => {
      const res = await apiRequest("POST", "/api/import", data);
      return res.json();
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      const parts: string[] = [];
      if (result.employees.added > 0) parts.push(`新規${result.employees.added}名`);
      if (result.employees.updated > 0) parts.push(`更新${result.employees.updated}名`);
      if (result.paidLeaves.imported > 0) parts.push(`有給${result.paidLeaves.imported}件`);
      toast({
        title: "インポート完了",
        description: parts.length > 0 ? parts.join("、") : "対象データなし",
      });
    },
    onError: (error) => {
      toast({
        title: "インポート失敗",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  // ── Mutation: POST /api/import-overtimes ──────────────────────────────────
  const importOvertimesMutation = useMutation({
    mutationFn: async (overtimes: Overtime[]): Promise<OvertimeImportResult> => {
      const res = await apiRequest("POST", "/api/import-overtimes", {
        overtimes,
      });
      return res.json();
    },
    onSuccess: (result) => {
      setOvertimeResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-overtimes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      toast({
        title: "残業データインポート完了",
        description: `残業データ ${result.importedOvertimes}件を取り込みました`,
      });
    },
    onError: (error) => {
      toast({
        title: "残業データインポート失敗",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  // ── Both mutations combined ───────────────────────────────────────────────
  const isImporting =
    importMutation.isPending || importOvertimesMutation.isPending;

  const importSucceeded =
    (importMutation.isSuccess || importOvertimesMutation.isSuccess) && !parsed;

  // ── File reading ──────────────────────────────────────────────────────────

  const processJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const employees: Employee[] = json.employees || [];
        const paidLeaves: PaidLeave[] = json.paidLeaves || [];
        const overtimes: Overtime[] = json.overtimes || [];
        setJsonRaw(json);
        setParsed({ employees, paidLeaves, overtimes });
        setFileType("json");
      } catch {
        toast({
          title: "ファイル読み込みエラー",
          description: "有効なJSONファイルを選択してください",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const processXlsx = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        let employees: Employee[] = [];
        let paidLeaves: PaidLeave[] = [];
        let overtimes: Overtime[] = [];

        for (const sheetName of workbook.SheetNames) {
          const kind = classifySheetName(sheetName);
          const sheet = workbook.Sheets[sheetName];
          if (kind === "employees") {
            employees = parseEmployeesSheet(sheet);
          } else if (kind === "paidLeaves") {
            paidLeaves = parsePaidLeavesSheet(sheet);
          } else if (kind === "overtimes") {
            overtimes = parseOvertimesSheet(sheet);
          }
        }

        if (
          employees.length === 0 &&
          paidLeaves.length === 0 &&
          overtimes.length === 0
        ) {
          toast({
            title: "シートが見つかりません",
            description:
              "シート名に「社員」「有給」「残業」（または英語名）を含めてください",
            variant: "destructive",
          });
          return;
        }

        setParsed({ employees, paidLeaves, overtimes });
        setFileType("xlsx");
        setJsonRaw(null);
      } catch (err) {
        toast({
          title: "Excelファイル読み込みエラー",
          description: String(err),
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // reset previous state
    setParsed(null);
    setJsonRaw(null);
    setFileType(null);
    setImportResult(null);
    setOvertimeResult(null);
    importMutation.reset();
    importOvertimesMutation.reset();

    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "json") {
      processJson(file);
    } else if (ext === "xlsx" || ext === "xls") {
      processXlsx(file);
    } else {
      toast({
        title: "非対応のファイル形式",
        description: ".json または .xlsx / .xls ファイルを選択してください",
        variant: "destructive",
      });
    }

    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Simulate a change event object
    const fakeEvent = {
      target: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    handleFileSelect(fakeEvent);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // ── Import execution ──────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!parsed) return;

    const hasEmployeesOrLeaves =
      parsed.employees.length > 0 || parsed.paidLeaves.length > 0;
    const hasOvertimes = parsed.overtimes.length > 0;

    const promises: Promise<unknown>[] = [];

    if (hasEmployeesOrLeaves) {
      if (fileType === "json" && jsonRaw) {
        promises.push(importMutation.mutateAsync(jsonRaw));
      } else {
        promises.push(
          importMutation.mutateAsync({
            employees: parsed.employees,
            paidLeaves: parsed.paidLeaves,
          })
        );
      }
    }

    if (hasOvertimes) {
      promises.push(importOvertimesMutation.mutateAsync(parsed.overtimes));
    }

    await Promise.allSettled(promises);

    // Clear preview after all done (success callbacks already fired)
    setParsed(null);
    setFileName("");
    setFileType(null);
    setJsonRaw(null);

    // Invalidate all relevant queries
    queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
    queryClient.invalidateQueries({ queryKey: ["/api/monthly-overtimes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
  };

  const handleCancel = () => {
    setParsed(null);
    setFileName("");
    setFileType(null);
    setJsonRaw(null);
    setImportResult(null);
    setOvertimeResult(null);
    importMutation.reset();
    importOvertimesMutation.reset();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const fileIcon =
    fileType === "xlsx" ? (
      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
    ) : (
      <FileJson className="h-4 w-4 text-primary" />
    );

  const dropAreaIcon =
    fileType === "xlsx" ? (
      <FileSpreadsheet className="h-10 w-10 text-emerald-400 mb-3" />
    ) : (
      <FileJson className="h-10 w-10 text-muted-foreground/40 mb-3" />
    );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" data-testid="page-title">
        Excel取込
      </h1>

      <Card className="border max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Upload className="h-4 w-4 text-primary" />
            ファイルインポート
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Excelファイル（.xlsx）またはJSONファイルを取り込みます
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Drop Area */}
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 p-8 hover:border-primary/40 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            data-testid="drop-area"
          >
            {dropAreaIcon}
            <p className="text-sm font-medium text-muted-foreground">
              ファイルを選択またはドロップ
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              .xlsx / .xls / .json に対応
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file"
            />
          </div>

          {/* Preview */}
          {parsed && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-4">
                {/* File name + badge */}
                <div className="flex items-center gap-2 mb-3">
                  {fileIcon}
                  <span className="text-sm font-medium truncate">{fileName}</span>
                  {fileType === "xlsx" ? (
                    <Badge
                      variant="outline"
                      className="text-xs text-emerald-700 border-emerald-300 bg-emerald-50 ml-auto shrink-0"
                      data-testid="badge-filetype"
                    >
                      Excel
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs ml-auto shrink-0"
                      data-testid="badge-filetype"
                    >
                      JSON
                    </Badge>
                  )}
                </div>

                {/* Data counts */}
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${
                      [
                        parsed.employees.length > 0,
                        parsed.paidLeaves.length > 0,
                        parsed.overtimes.length > 0,
                      ].filter(Boolean).length || 1
                    }, 1fr)`,
                  }}
                >
                  {parsed.employees.length > 0 && (
                    <div data-testid="preview-employees">
                      <p className="text-xs text-muted-foreground">社員データ</p>
                      <p className="text-lg font-bold">
                        {parsed.employees.length}
                        <span className="text-sm font-normal ml-1">名</span>
                      </p>
                    </div>
                  )}
                  {parsed.paidLeaves.length > 0 && (
                    <div data-testid="preview-paid-leaves">
                      <p className="text-xs text-muted-foreground">有給データ</p>
                      <p className="text-lg font-bold">
                        {parsed.paidLeaves.length}
                        <span className="text-sm font-normal ml-1">件</span>
                      </p>
                    </div>
                  )}
                  {parsed.overtimes.length > 0 && (
                    <div data-testid="preview-overtimes">
                      <p className="text-xs text-muted-foreground">残業データ</p>
                      <p className="text-lg font-bold">
                        {parsed.overtimes.length}
                        <span className="text-sm font-normal ml-1">件</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleImport}
                  disabled={isImporting}
                  data-testid="button-import"
                >
                  {isImporting ? (
                    "インポート中..."
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      インポート実行
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isImporting}
                  data-testid="button-cancel-import"
                >
                  キャンセル
                </Button>
              </div>
            </div>
          )}

          {/* Success message with detailed results */}
          {importSucceeded && (
            <div className="space-y-3" data-testid="import-success-message">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-700">
                  インポートが完了しました
                </p>
              </div>

              {/* Employee + PaidLeave breakdown */}
              {importResult && (
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">社員データ</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-emerald-600">{importResult.employees.added}</p>
                      <p className="text-xs text-muted-foreground">新規追加</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-blue-600">{importResult.employees.updated}</p>
                      <p className="text-xs text-muted-foreground">更新</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${importResult.employees.skipped > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {importResult.employees.skipped}
                      </p>
                      <p className="text-xs text-muted-foreground">スキップ</p>
                    </div>
                  </div>
                  {importResult.employees.skippedNames.length > 0 && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2">
                      <p className="text-xs text-amber-700 font-medium mb-1">スキップ理由:</p>
                      <ul className="text-xs text-amber-600 space-y-0.5">
                        {importResult.employees.skippedNames.map((name, i) => (
                          <li key={i}>・{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(importResult.paidLeaves.imported + importResult.paidLeaves.skipped > 0) && (
                    <>
                      <div className="border-t border-border" />
                      <p className="text-xs font-medium text-muted-foreground">有給データ</p>
                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div>
                          <p className="text-lg font-bold text-emerald-600">{importResult.paidLeaves.imported}</p>
                          <p className="text-xs text-muted-foreground">取込済</p>
                        </div>
                        <div>
                          <p className={`text-lg font-bold ${importResult.paidLeaves.skipped > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {importResult.paidLeaves.skipped}
                          </p>
                          <p className="text-xs text-muted-foreground">スキップ</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Overtime breakdown */}
              {overtimeResult && (
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">残業データ</p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-emerald-600">{overtimeResult.importedOvertimes}</p>
                      <p className="text-xs text-muted-foreground">取込済</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${overtimeResult.skipped > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {overtimeResult.skipped}
                      </p>
                      <p className="text-xs text-muted-foreground">スキップ</p>
                    </div>
                  </div>
                  {overtimeResult.skippedReasons.length > 0 && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2">
                      <p className="text-xs text-amber-700 font-medium mb-1">スキップ理由:</p>
                      <ul className="text-xs text-amber-600 space-y-0.5">
                        {overtimeResult.skippedReasons.map((reason, i) => (
                          <li key={i}>・{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Format Guide */}
      <Card className="border max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            対応フォーマット
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Excel Guide */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">Excel (.xlsx)</span>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1 text-muted-foreground">
              <p>
                シート名で自動認識します：
              </p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>
                  <strong className="text-foreground">社員</strong> / employees
                  → 社員データ（ID/社員番号, 氏名/名前, 配属先, 入社日, 勤続月数）
                </li>
                <li>
                  <strong className="text-foreground">有給</strong> / paidLeaves / paid_leaves
                  → 有給データ（社員ID, 年度, 付与日数, 繰越日数, 消化日数, 残日数, 失効日数, 取得率）
                </li>
                <li>
                  <strong className="text-foreground">残業</strong> / overtime / monthlyOvertimes
                  → 残業データ（社員ID, 年, 月, 残業時間, 深夜残業）
                </li>
              </ul>
              <p className="mt-1">
                ※ 既存社員IDは上書き更新、新規IDは追加されます。ID/名前なしの行はスキップされます。
              </p>
            </div>
          </div>

          {/* JSON Guide */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileJson className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">JSON (.json)</span>
            </div>
            <pre className="rounded-md bg-muted/50 p-4 text-xs overflow-x-auto">
{`{
  "employees": [
    {
      "id": "1",
      "name": "佐藤 太郎",
      "assignment": "ジェイ･バス",
      "joinDate": "2015-07-21",
      "tenureMonths": 126
    }
  ],
  "paidLeaves": [
    {
      "employeeId": "1",
      "fiscalYear": 2025,
      "grantedDays": 20.0,
      "carriedOverDays": 10.0,
      "consumedDays": 5.0,
      "remainingDays": 25.0,
      "expiredDays": 0.0,
      "usageRate": 0.167
    }
  ],
  "overtimes": [
    {
      "employeeId": "1",
      "year": 2025,
      "month": 4,
      "overtimeHours": 12.5,
      "lateNightOvertime": 0
    }
  ]
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
