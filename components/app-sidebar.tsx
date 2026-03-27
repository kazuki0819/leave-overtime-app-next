"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Clock,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/leave", label: "有給管理", icon: Calendar },
  { href: "/overtime", label: "残業管理", icon: Clock },
  { href: "/employees", label: "社員一覧", icon: Users },
  { href: "/settings", label: "設定", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen w-60 bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] border-r border-[hsl(var(--sidebar-border))]"
      data-testid="app-sidebar"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-[hsl(var(--sidebar-border))] px-5">
        <Calendar className="h-6 w-6 text-[hsl(var(--sidebar-primary))]" />
        <span className="text-sm font-bold tracking-tight">有給・残業管理</span>
      </div>

      <nav className="space-y-0.5 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"
                  : "text-[hsl(var(--sidebar-foreground)/0.7)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
              }`}
              data-testid={`nav-${item.href.replace("/", "") || "dashboard"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-3 left-3 right-3 rounded-md bg-[hsl(var(--sidebar-accent)/0.5)] px-3 py-2 text-xs text-[hsl(var(--sidebar-foreground)/0.5)]">
        <p>2025年4月 〜 2026年3月</p>
        <p>宇都宮拠点</p>
      </div>
    </aside>
  );
}
