"use client";

import { useState, useCallback, useEffect } from "react";

const MAX_HISTORY = 10;

export function useSearchHistory(storageKey: string) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHistory(
            parsed
              .filter((v): v is string => typeof v === "string")
              .slice(0, MAX_HISTORY),
          );
        }
      }
    } catch {
      // JSON parse failure — ignore
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: string[]) => {
      setHistory(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // storage quota exceeded — ignore
      }
    },
    [storageKey],
  );

  const addEntry = useCallback(
    (keyword: string) => {
      const trimmed = keyword.trim();
      if (!trimmed) return;
      setHistory((prev) => {
        const filtered = prev.filter((h) => h !== trimmed);
        const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  const removeEntry = useCallback(
    (keyword: string) => {
      setHistory((prev) => {
        const next = prev.filter((h) => h !== keyword);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  return { history, addEntry, removeEntry } as const;
}
