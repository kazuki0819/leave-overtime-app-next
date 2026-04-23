"use client";

import { useState, useRef } from "react";
import { Search, X, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSearchHistory } from "@/hooks/use-search-history";

const STORAGE_KEY = "lo-app:search:employees";

interface SearchWithHistoryProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function SearchWithHistory({
  value,
  onChange,
  placeholder = "氏名・配属先で検索...",
  className = "pl-9",
  "data-testid": testId,
}: SearchWithHistoryProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { history, addEntry, removeEntry } = useSearchHistory(STORAGE_KEY);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="search"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              if (history.length > 0) setPopoverOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                addEntry(value.trim());
                setPopoverOpen(false);
              }
            }}
            className={className}
            data-testid={testId}
          />
        </div>
      </PopoverTrigger>
      {history.length > 0 && (
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-1.5 px-2 pb-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            検索履歴
          </div>
          {history.map((keyword) => (
            <div
              key={keyword}
              className="flex items-center justify-between rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/60"
              onClick={() => {
                onChange(keyword);
                setPopoverOpen(false);
                inputRef.current?.focus();
              }}
            >
              <span className="truncate">{keyword}</span>
              <button
                type="button"
                className="shrink-0 ml-2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  removeEntry(keyword);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </PopoverContent>
      )}
    </Popover>
  );
}
