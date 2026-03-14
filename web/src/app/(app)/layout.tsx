"use client";

import { Sidebar } from "@/components/sidebar";
import { useWebSocket } from "@/lib/ws";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { connected, events } = useWebSocket();

  return (
    <div className="flex h-screen">
      <Sidebar connected={connected} events={events} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
