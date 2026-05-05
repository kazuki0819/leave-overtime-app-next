// 残業管理画面専用コンポーネント（PR-3 で有給側の年度概念を削除したため）
"use client";

import { useState } from "react";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarDays, Search } from "lucide-react";

export function FiscalYearSelector({ className }: { className?: string }) {
  const { fiscalYear, setFiscalYear, fiscalYearOptions } = useFiscalYear();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchError, setSearchError] = useState("");

  const isInDropdown = fiscalYearOptions.includes(fiscalYear);

  const handleSearch = () => {
    const year = parseInt(searchValue, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      setSearchError("2000〜2100の年度を入力してください");
      return;
    }
    setSearchError("");
    setFiscalYear(year);
    setSearchOpen(false);
    setSearchValue("");
  };

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`} data-testid="fiscal-year-selector">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <Select
        value={String(fiscalYear)}
        onValueChange={(v) => setFiscalYear(parseInt(v, 10))}
      >
        <SelectTrigger className="w-[140px] h-8 text-sm" data-testid="fiscal-year-trigger">
          <SelectValue>{fiscalYear}年度</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* プルダウン範囲外の年度が選択されている場合、先頭に表示 */}
          {!isInDropdown && (
            <SelectItem value={String(fiscalYear)} data-testid={`fiscal-year-option-${fiscalYear}`}>
              {fiscalYear}年度
            </SelectItem>
          )}
          {fiscalYearOptions.map((y) => (
            <SelectItem key={y} value={String(y)} data-testid={`fiscal-year-option-${y}`}>
              {y}年度
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 過去年度検索ボタン */}
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="過去の年度を検索"
            data-testid="fiscal-year-search-button"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="end">
          <p className="text-xs font-medium mb-2">年度を指定して表示</p>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
            className="flex gap-1.5"
          >
            <Input
              type="number"
              min={2000}
              max={2100}
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value); setSearchError(""); }}
              placeholder="例: 2020"
              className="h-8 text-sm"
              autoFocus
              data-testid="fiscal-year-search-input"
            />
            <Button type="submit" size="sm" className="h-8 px-3" data-testid="fiscal-year-search-submit">
              表示
            </Button>
          </form>
          {searchError && (
            <p className="text-xs text-destructive mt-1.5">{searchError}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            プルダウンにない過去の年度を直接指定できます
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
