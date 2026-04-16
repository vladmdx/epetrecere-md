"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConversationPreview {
  id: number;
  artistName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: number;
}

const POLL_INTERVAL_MS = 60_000;

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

export function ChatBell() {
  const { isSignedIn, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [userRole, setUserRole] = useState<"client" | "artist" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Detect if user is artist or client
  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/auth/check-role")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.role === "artist" || data?.role === "venue") setUserRole("artist");
        else setUserRole("client");
      })
      .catch(() => setUserRole("client"));
  }, [isSignedIn]);

  const load = useCallback(async () => {
    if (!isSignedIn || !userRole) return;
    try {
      const res = await fetch(`/api/conversations?role=${userRole}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const convos: ConversationPreview[] = data.map((c: Record<string, unknown>) => ({
          id: c.id as number,
          artistName: (c.artistName as string) || (c.clientName as string) || "Conversație",
          lastMessagePreview: c.lastMessagePreview as string | null,
          lastMessageAt: c.lastMessageAt as string | null,
          unread: userRole === "artist"
            ? ((c.artistUnread as number) || 0)
            : ((c.clientUnread as number) || 0),
        }));
        setConversations(convos);
        setTotalUnread(convos.reduce((sum, c) => sum + c.unread, 0));
      }
    } catch {
      // silent
    }
  }, [isSignedIn, userRole]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isLoaded, isSignedIn, load]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!isLoaded || !isSignedIn) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-full"
        aria-label="Mesaje"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
      >
        <MessageCircle className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-background">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border/40 bg-popover shadow-lg overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
              <h3 className="text-sm font-semibold">Mesaje</h3>
              {totalUnread > 0 && (
                <span className="text-[10px] text-gold">{totalUnread} necitite</span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Nu aveți conversații încă.
                </div>
              ) : (
                conversations
                  .sort((a, b) => {
                    if (!a.lastMessageAt) return 1;
                    if (!b.lastMessageAt) return -1;
                    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
                  })
                  .map((conv) => (
                    <Link
                      key={conv.id}
                      href={userRole === "artist" ? `/dashboard/mesaje?conversation=${conv.id}` : `/cabinet/mesaje?conversation=${conv.id}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/20 last:border-0",
                        conv.unread > 0 && "bg-gold/5",
                      )}
                    >
                      {conv.unread > 0 && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                      )}
                      <div className={cn("flex-1 min-w-0", conv.unread === 0 && "ml-5")}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium truncate">{conv.artistName}</p>
                          {conv.lastMessageAt && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {timeAgo(conv.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        {conv.lastMessagePreview && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {conv.lastMessagePreview}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
