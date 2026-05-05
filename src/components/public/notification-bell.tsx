"use client";

// M5 — Header notification bell.
//
// Polls /api/notifications every 60 seconds when the user is signed in,
// shows an unread count badge, and opens a dropdown with the latest 20
// notifications. Click-to-read (and navigate) + a "mark all as read" action.
//
// Filters out message notifications — those are surfaced in the chat
// bell only, so the notifications panel stays focused on bookings/reviews.
//
// Plays a soft chime when new unread notifications arrive (toggleable
// via the user's "notificationSoundEnabled" localStorage flag).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Loader2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playNotificationChime } from "@/lib/notifications/sound";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

// Notifications surfaced via /chat or chat-bell — don't show them in the
// global notification bell.
const HIDDEN_TYPES = new Set([
  "message_new",
  "chat_new",
  "conversation_new",
]);

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "acum";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}z`;
  return new Date(iso).toLocaleDateString("ro-MD");
}

export function NotificationBell() {
  const { isSignedIn, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastUnreadRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const all: Notification[] = data.notifications ?? [];
      // Filter out chat/message types — those have their own bell.
      const filtered = all.filter((n) => !HIDDEN_TYPES.has(n.type));
      const unread = filtered.filter((n) => !n.isRead).length;

      // If the count went UP since last poll, play a chime. The chime
      // helper internally checks the user's sound preference (on by
      // default, toggleable from /cabinet/setari + /dashboard/setari).
      if (
        lastUnreadRef.current !== null &&
        unread > lastUnreadRef.current
      ) {
        playNotificationChime();
      }
      lastUnreadRef.current = unread;

      setItems(filtered);
      setUnreadCount(unread);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  // Initial + poll loop when signed in
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void load();
    const t = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [isLoaded, isSignedIn, load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!isLoaded || !isSignedIn) return null;

  async function markAllRead() {
    // Optimistic
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", { method: "POST" });
    } catch {
      void load();
    }
  }

  async function markOneRead(id: number) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      void load();
    }
  }

  // Open the dropdown AND eagerly mark everything as read. The user "saw"
  // the notifications by clicking the bell — counts as viewed even if they
  // don't click each individual row. Server still keeps the actionUrl, so
  // they can click into a specific notification later from the dropdown.
  function toggleAndMarkSeen() {
    setOpen((prev) => {
      const next = !prev;
      if (next && unreadCount > 0) void markAllRead();
      return next;
    });
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-full"
        onClick={toggleAndMarkSeen}
        aria-label="Notificări"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-[#0D0D0D]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            // Mobile fix: w-80 (320px) overflowed narrow phones and got
            // clipped at the viewport edge. Cap to viewport width minus
            // a 1rem inset on small screens, keep w-80 on tablet+.
            className="fixed right-2 top-14 z-50 w-[calc(100vw-1rem)] max-w-sm overflow-hidden rounded-xl border border-border/40 bg-popover shadow-2xl sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-80"
          >
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Notificări</p>
                {unreadCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {unreadCount} necitite
                  </p>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-gold hover:underline"
                >
                  <Check className="h-3 w-3" /> Marchează toate
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nicio notificare încă.
                </p>
              ) : (
                items.map((n) => {
                  const Row = n.actionUrl ? Link : "div";
                  return (
                    <Row
                      key={n.id}
                      href={n.actionUrl ?? "#"}
                      onClick={() => {
                        if (!n.isRead) void markOneRead(n.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "block border-b border-border/30 px-4 py-3 transition-colors last:border-0",
                        !n.isRead && "bg-gold/5",
                        n.actionUrl && "hover:bg-accent cursor-pointer",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm",
                              !n.isRead ? "font-medium" : "text-muted-foreground",
                            )}
                          >
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {n.message}
                            </p>
                          )}
                          <p className="mt-1 text-[10px] uppercase text-muted-foreground">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </Row>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
