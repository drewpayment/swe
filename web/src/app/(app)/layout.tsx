"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { useWebSocket } from "@/lib/ws";
import { Menu } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { connected, events } = useWebSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen">
      {/* Mobile hamburger button */}
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={sidebarOpen}
        className="lg:hidden fixed top-4 left-4 z-40 flex items-center justify-center h-9 w-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        connected={connected}
        events={events}
        sidebarOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 py-8 lg:pt-8 pt-16 flex-1 flex flex-col min-h-0">{children}</div>
      </main>
    </div>
  );
}
