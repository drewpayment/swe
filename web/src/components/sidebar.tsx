"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Activity,
  Bot,
  Bell,
} from "lucide-react";
import { getUnreadCount, listNotifications, markNotificationRead } from "@/lib/api";
import type { Notification } from "@/lib/types";
import type { StreamEvent } from "@/lib/ws";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  connected?: boolean;
  events?: StreamEvent[];
}

export function Sidebar({ connected, events }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const lastEventCount = useRef(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const bellFocusIndexRef = useRef<number>(0);

  // Poll unread count every 15 seconds
  useEffect(() => {
    async function fetchCount() {
      const res = await getUnreadCount();
      if (res.success && res.data) {
        setUnreadCount(res.data.count);
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, []);

  // Increment count in real-time when notification_created events arrive
  useEffect(() => {
    if (!events || events.length === 0) return;

    const newEvents = events.slice(lastEventCount.current);
    lastEventCount.current = events.length;

    for (const event of newEvents) {
      if (event.type === "notification_created") {
        setUnreadCount((prev) => prev + 1);
      }
    }
  }, [events]);

  // Fetch notifications when dropdown opens
  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    const res = await listNotifications(undefined, false);
    if (res.success && res.data) {
      setNotifications(res.data.slice(0, 10));
    }
    setNotificationsLoading(false);
  }, []);

  useEffect(() => {
    if (bellOpen) {
      fetchNotifications();
      // Focus first item after render
      bellFocusIndexRef.current = 0;
      setTimeout(() => {
        if (bellRef.current) {
          const items = bellRef.current.querySelectorAll<HTMLElement>('[role="option"]');
          items[0]?.focus();
        }
      }, 50);
    }
  }, [bellOpen, fetchNotifications]);

  function handleBellKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!bellOpen) return;
    const items = bellRef.current
      ? Array.from(bellRef.current.querySelectorAll<HTMLElement>('[role="option"]'))
      : [];
    if (items.length === 0 && e.key !== "Escape") return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setBellOpen(false);
        bellButtonRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        bellFocusIndexRef.current = (bellFocusIndexRef.current + 1) % items.length;
        items[bellFocusIndexRef.current]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        bellFocusIndexRef.current = (bellFocusIndexRef.current - 1 + items.length) % items.length;
        items[bellFocusIndexRef.current]?.focus();
        break;
      case "Home":
        e.preventDefault();
        bellFocusIndexRef.current = 0;
        items[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        bellFocusIndexRef.current = items.length - 1;
        items[items.length - 1]?.focus();
        break;
    }
  }

  // Close dropdown on click outside
  useEffect(() => {
    if (!bellOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [bellOpen]);

  async function handleNotificationClick(notif: Notification) {
    if (!notif.read) {
      await markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setBellOpen(false);
    const url = notif.action_url || `/projects/${notif.project_id}`;
    router.push(url);
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">SWE</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Agentic Platform
          </p>
        </div>
      </div>

      {/* Notification bell */}
      <div className="border-b border-zinc-800 px-3 py-3 relative" ref={bellRef} onKeyDown={handleBellKeyDown}>
        <button
          ref={bellButtonRef}
          onClick={() => setBellOpen((prev) => !prev)}
          aria-label="Notifications"
          aria-expanded={bellOpen}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
        >
          <div className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          Notifications
        </button>
        <span aria-live="polite" aria-atomic="true" className="sr-only">
          {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : ""}
        </span>

        {bellOpen && (
          <div
            role="listbox"
            aria-label="Notifications"
            className="absolute left-2 right-2 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
          >
            {notificationsLoading && notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-zinc-500">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-zinc-500">
                No notifications
              </div>
            ) : (
              <>
                {notifications.map((notif) => (
                  <button
                    key={notif.id}
                    role="option"
                    aria-selected={false}
                    onClick={() => handleNotificationClick(notif)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-b-0",
                      !notif.read && "bg-blue-950/20"
                    )}
                  >
                    <span className="flex-shrink-0 text-sm mt-0.5">{"\uD83D\uDE80"}</span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-xs leading-snug truncate",
                          notif.read ? "text-zinc-400" : "text-zinc-200 font-medium"
                        )}
                      >
                        {notif.title}
                      </p>
                      {notif.body && (
                        <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                          {notif.body}
                        </p>
                      )}
                      <span className="text-[10px] text-zinc-600 mt-0.5 block">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                    </div>
                    {!notif.read && (
                      <span className="flex-shrink-0 mt-1.5 h-2 w-2 rounded-full bg-blue-500 block" />
                    )}
                  </button>
                ))}
                <Link
                  href="/projects"
                  onClick={() => setBellOpen(false)}
                  className="block px-3 py-2 text-center text-xs text-blue-400 hover:bg-zinc-800 transition-colors border-t border-zinc-700"
                >
                  View all
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status footer */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Activity className="h-3 w-3" />
          <span>v0.1.0</span>
          <span className="ml-auto flex items-center gap-1">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-green-500" : "bg-yellow-500"
              )}
            />
            {connected ? "Connected" : "Offline"}
          </span>
        </div>
      </div>
    </aside>
  );
}
