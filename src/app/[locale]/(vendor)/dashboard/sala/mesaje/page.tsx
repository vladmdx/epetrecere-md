// Venue messages inbox — spec section 6.
//
// Canonical vendor messages page. Supports both artist and venue owners via
// ?role=vendor (server figures out which conversations belong to this user).
// The legacy /dashboard/mesaje path re-exports this.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Send,
  User,
  Loader2,
  Paperclip,
  ArrowLeft,
  Calendar as CalendarIcon,
  X,
  FileText,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeEventType, eventTypeLabel } from "@/lib/events/normalize";
import { useLocale } from "@/hooks/use-locale";

interface LinkedBooking {
  id: number;
  eventType: string | null;
  eventDate: string | null;
  status: string;
}

interface Conversation {
  id: number;
  artistId: number | null;
  venueId: number | null;
  clientUserId: string;
  clientName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
  artistUnread: number;
  createdAt: string;
  linkedBooking: LinkedBooking | null;
}

interface ChatMessage {
  id: number;
  senderType: string;
  senderName: string;
  message: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("ro-RO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short" });
}

function formatBookingBadge(
  b: LinkedBooking,
  t: (key: string) => string,
): string {
  const eventTypeKey = normalizeEventType(b.eventType);
  const label = eventTypeKey
    ? eventTypeLabel(eventTypeKey)
    : t("vendor.venueMessages.eventFallback");
  if (!b.eventDate) return `Re: ${label}`;
  const d = new Date(b.eventDate + "T00:00:00");
  return `Re: ${label} ${d.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
  })}`;
}

export default function VenueMessagesPage() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const initialConv = searchParams.get("conversation");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialConv ? Number(initialConv) : null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<{
    url: string;
    name: string;
    mime: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations?role=vendor");
      const data = await res.json();
      const list: Conversation[] = Array.isArray(data) ? data : [];
      setConversations(list);
      if (list.length && selectedId == null) {
        setSelectedId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(id: number) {
    setSelectedId(id);
    const res = await fetch(`/api/conversations/${id}/messages`);
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
    // Reflect unread-cleared state locally.
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, artistUnread: 0 } : c)),
    );
    // Force the chat bell to refresh its badge immediately (skip the 60s poll).
    window.dispatchEvent(new CustomEvent("chat:read", { detail: { conversationId: id } }));
  }

  async function uploadAttachment(file: File) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowed.includes(file.type)) {
      toast.error(t("vendor.venueMessages.onlyImagesOrPdf"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("vendor.venueMessages.fileTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "uploads");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("moments.errUploadFailed"));
        return;
      }
      const data = (await res.json()) as { url: string };
      setPendingAttachment({
        url: data.url,
        name: file.name,
        mime: file.type,
      });
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if ((!text && !pendingAttachment) || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          attachmentUrl: pendingAttachment?.url,
          attachmentName: pendingAttachment?.name,
          attachmentMime: pendingAttachment?.mime,
        }),
      });
      if (!res.ok) {
        toast.error(t("vendor.venueMessages.sendFailed"));
        return;
      }
      const inserted = (await res.json()) as ChatMessage;
      setMessages((prev) => [...prev, inserted]);
      // Update preview in sidebar.
      const preview =
        text ||
        (pendingAttachment?.mime.startsWith("image/")
          ? t("vendor.venueMessages.previewImage")
          : pendingAttachment?.mime === "application/pdf"
            ? t("vendor.venueMessages.previewPdf")
            : t("vendor.venueMessages.previewAttachment"));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                lastMessagePreview:
                  preview.length > 120 ? preview.slice(0, 117) + "…" : preview,
                lastMessageAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      setDraft("");
      setPendingAttachment(null);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId != null) void openConversation(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const selected = conversations.find((c) => c.id === selectedId) || null;

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((t) => {
      const haystack = [
        t.clientName,
        t.lastMessagePreview,
        t.linkedBooking?.eventType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [conversations, search]);

  // Mobile: when a conversation is open, hide the thread list. Desktop shows both.
  const mobileShowList = selectedId == null;

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold">{t("dashboard.messages")}</h1>

      <div className="grid h-[calc(100vh-14rem)] gap-4 lg:grid-cols-[22rem_1fr]">
        {/* Thread list — hidden on mobile when a chat is open */}
        <div
          className={cn(
            "flex-col gap-2 overflow-hidden",
            mobileShowList ? "flex" : "hidden lg:flex",
          )}
        >
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("vendor.venueMessages.searchPlaceholder")}
              className="pl-9"
            />
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-gold" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search
                  ? t("vendor.venueMessages.noneForFilter")
                  : t("vendor.venueMessages.emptyInbox")}
              </p>
            ) : (
              filteredConversations.map((thread) => {
                const isActive = selectedId === thread.id;
                return (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedId(thread.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all",
                      isActive
                        ? "border-gold bg-gold/5"
                        : "border-border/40 hover:border-gold/30",
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {thread.clientName ||
                            `${t("auth.roleClient")} #${thread.clientUserId.slice(0, 8)}`}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(thread.lastMessageAt)}
                        </span>
                      </div>
                      {thread.linkedBooking && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                          <CalendarIcon className="h-2.5 w-2.5" />
                          {formatBookingBadge(thread.linkedBooking, t)}
                        </span>
                      )}
                      {thread.lastMessagePreview && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {thread.lastMessagePreview}
                        </p>
                      )}
                    </div>
                    {thread.artistUnread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-[#0D0D0D]">
                        {thread.artistUnread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat area */}
        <Card
          className={cn(
            "flex-col",
            mobileShowList ? "hidden lg:flex" : "flex",
          )}
        >
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
                {/* Back button — mobile only */}
                <button
                  type="button"
                  aria-label={t("vendor.venueMessages.backToList")}
                  onClick={() => setSelectedId(null)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {selected.clientName || t("auth.roleClient")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {selected.linkedBooking && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                        <CalendarIcon className="h-2.5 w-2.5" />
                        {formatBookingBadge(selected.linkedBooking, t)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                ref={scrollRef}
                className="flex-1 space-y-3 overflow-y-auto p-4"
              >
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("vendor.venueMessages.noMessages")}
                  </p>
                ) : (
                  messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      mine={
                        msg.senderType === "artist" ||
                        msg.senderType === "venue"
                      }
                    />
                  ))
                )}
              </div>

              {/* Pending attachment preview */}
              {pendingAttachment && (
                <div className="flex items-center gap-2 border-t border-border/40 bg-muted/30 px-4 py-2 text-xs">
                  {pendingAttachment.mime.startsWith("image/") ? (
                    <ImageIcon className="h-3.5 w-3.5 text-gold" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-gold" />
                  )}
                  <span className="flex-1 truncate font-medium">
                    {pendingAttachment.name}
                  </span>
                  <button
                    type="button"
                    aria-label={t("vendor.venueMessages.cancelAttachment")}
                    onClick={() => setPendingAttachment(null)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              <div className="flex gap-2 border-t border-border/40 p-4">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || sending}
                  aria-label={t("vendor.venueMessages.attachFile")}
                  className="shrink-0"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAttachment(f);
                    e.currentTarget.value = "";
                  }}
                />
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("chat.inputPlaceholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  disabled={sending}
                />
                <Button
                  onClick={sendMessage}
                  disabled={
                    sending ||
                    (!draft.trim() && !pendingAttachment)
                  }
                  aria-label={t("chat.send")}
                  className="shrink-0 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                  size="icon"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t("vendor.venueMessages.selectConversation")}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Renders a single chat bubble with optional inline attachment. */
function MessageBubble({ msg, mine }: { msg: ChatMessage; mine: boolean }) {
  const { t } = useLocale();
  const isImage = !!msg.attachmentMime?.startsWith("image/");
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-xl px-4 py-2.5 text-sm",
          mine ? "bg-gold text-[#0D0D0D]" : "bg-accent",
        )}
      >
        <p className="mb-1 text-[10px] font-medium opacity-60">
          {msg.senderName}
        </p>
        {msg.attachmentUrl && (
          <div className="mb-2">
            {isImage ? (
              <a
                href={msg.attachmentUrl}
                target="_blank"
                rel="noopener"
                className="block"
              >
                <img
                  src={msg.attachmentUrl}
                  alt={msg.attachmentName ?? t("vendor.venueMessages.imageAlt")}
                  className="max-h-72 rounded-lg object-cover"
                />
              </a>
            ) : (
              <a
                href={msg.attachmentUrl}
                target="_blank"
                rel="noopener"
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                  mine
                    ? "border-[#0D0D0D]/20 bg-[#0D0D0D]/10 hover:bg-[#0D0D0D]/15"
                    : "border-border/40 bg-background/60 hover:bg-background",
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="max-w-40 truncate">
                  {msg.attachmentName ?? t("vendor.venueMessages.attachment")}
                </span>
                <Download className="h-3 w-3 opacity-60" />
              </a>
            )}
          </div>
        )}
        {msg.message && (
          <p className="whitespace-pre-wrap break-words">{msg.message}</p>
        )}
        <p className="mt-1 text-[10px] opacity-60">
          {new Date(msg.createdAt).toLocaleString("ro-RO")}
        </p>
      </div>
    </div>
  );
}
