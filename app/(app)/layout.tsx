"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FiscalYearProvider } from "@/hooks/use-fiscal-year";
import { Toaster } from "@/components/ui/toaster";
import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FiscalYearProvider>
          <Toaster />
          <div className="flex min-h-screen">
            <AppSidebar />
            <main className="flex-1 ml-60 p-6">
              {children}
            </main>
          </div>
        </FiscalYearProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
