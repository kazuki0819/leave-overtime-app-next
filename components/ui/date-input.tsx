"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DateInput — テンキーで YYYY/MM/DD を素直に入力できる日付フィールド。
 *
 * Props:
 *  - value: "YYYY-MM-DD" 形式の文字列（API互換）
 *  - onChange: "YYYY-MM-DD" 形式で返す
 *  - enableWareki: true にすると和暦入力(R4.7.19等)を西暦に自動変換
 *  - className / data-testid 等、Input と同様に使える
 */
interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  enableWareki?: boolean;
}

// YYYY-MM-DD → YYYY/MM/DD
function toDisplay(iso: string): string {
  if (!iso) return "";
  return iso.replace(/-/g, "/");
}

// YYYY/MM/DD → YYYY-MM-DD
function toISO(display: string): string {
  return display.replace(/\//g, "-");
}

// 数字と / だけ残し、自動で / を挿入
function formatInput(raw: string): string {
  // 数字のみ抽出
  const digits = raw.replace(/[^\d]/g, "");
  let result = "";
  for (let i = 0; i < digits.length && i < 8; i++) {
    if (i === 4 || i === 6) result += "/";
    result += digits[i];
  }
  return result;
}

const WAREKI_OFFSETS: Record<string, number> = { r: 2018, h: 1988, s: 1925 };
const WAREKI_RE = /^([RHSrhs])(\d{1,2})[./\-年](\d{1,2})[./\-月](\d{1,2})[日]?$/;

export function parseWareki(raw: string): string | null {
  const trimmed = raw.trim();
  const m = WAREKI_RE.exec(trimmed);
  if (!m) return null;
  const offset = WAREKI_OFFSETS[m[1].toLowerCase()];
  if (offset === undefined) return null;
  const year = offset + Number(m[2]);
  const month = Number(m[3]);
  const day = Number(m[4]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getMonth() + 1 !== month || d.getDate() !== day) return null;
  return iso;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, enableWareki, className, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => toDisplay(value));

    // 外部 value が変わったら表示も更新（ただし入力中は上書きしない）
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
      const el = typeof ref === "function" ? inputRef.current : (ref?.current ?? inputRef.current);
      if (document.activeElement !== el) {
        setDisplay(toDisplay(value));
      }
    }, [value]);

    const startsWithEra = (s: string) => /^[RHSrhs]/.test(s);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;

      if (enableWareki && startsWithEra(raw)) {
        setDisplay(raw);
        const iso = parseWareki(raw);
        if (iso) {
          onChange(iso);
        }
        return;
      }

      const formatted = formatInput(raw);
      setDisplay(formatted);

      if (formatted.length === 10) {
        const iso = toISO(formatted);
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
          onChange(iso);
        }
      } else if (formatted.length === 0) {
        onChange("");
      }
    };

    const handleBlur = () => {
      if (enableWareki && startsWithEra(display)) {
        const iso = parseWareki(display);
        if (iso) {
          setDisplay(toDisplay(iso));
        } else {
          setDisplay(toDisplay(value));
        }
        return;
      }
      if (display.length > 0 && display.length < 10) {
        setDisplay(toDisplay(value));
      }
    };

    return (
      <input
        ref={(el) => {
          inputRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        type="text"
        inputMode={enableWareki ? undefined : "numeric"}
        placeholder={enableWareki ? "YYYY/MM/DD or R6.5.24" : "YYYY/MM/DD"}
        maxLength={enableWareki ? 15 : 10}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 tabular-nums",
          className,
        )}
        {...props}
      />
    );
  },
);

DateInput.displayName = "DateInput";
