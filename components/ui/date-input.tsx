"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DateInput — テンキーで YYYY/MM/DD を素直に入力できる日付フィールド。
 *
 * Props:
 *  - value: "YYYY-MM-DD" 形式の文字列（API互換）
 *  - onChange: "YYYY-MM-DD" 形式で返す
 *  - className / data-testid 等、Input と同様に使える
 */
interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
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

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => toDisplay(value));

    // 外部 value が変わったら表示も更新（ただし入力中は上書きしない）
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
      const el = typeof ref === "function" ? inputRef.current : (ref?.current ?? inputRef.current);
      if (document.activeElement !== el) {
        setDisplay(toDisplay(value));
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatInput(e.target.value);
      setDisplay(formatted);

      // 完全な日付（YYYY/MM/DD = 10文字）になったら onChange を発火
      if (formatted.length === 10) {
        const iso = toISO(formatted);
        // 簡易バリデーション
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
          onChange(iso);
        }
      } else if (formatted.length === 0) {
        onChange("");
      }
    };

    const handleBlur = () => {
      // フォーカスを外したとき、不完全な入力なら元の値に戻す
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
        inputMode="numeric"
        placeholder="YYYY/MM/DD"
        maxLength={10}
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
