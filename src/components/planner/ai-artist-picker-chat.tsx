"use client";

// AI assistant surfaced inside the "Rezervări Artiști" tab. The client
// asks in natural language ("recomandă-mi top 3 DJ cu rating 4+") and
// Claude lists options from DB. A separate, server-bound card is the only
// place where the user can explicitly send a booking request.

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, Bot, Wand2, ShieldCheck } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

type PendingProposal = {
  proposalToken: string;
  artistId: number;
  artistName: string;
  categoryId: number;
  categoryName: string;
  eventDate: string;
  eventType: string | null;
  guestCount: number | null;
  contactEmailMasked: string | null;
  contactPhoneMasked: string | null;
  message: string;
  expiresAt: string;
};

const TERMINAL_CONFIRM_CODES = new Set([
  "AI_PROPOSAL_INVALID",
  "AI_PROPOSAL_EXPIRED",
  "AI_PROPOSAL_MISMATCH",
  "AI_PROPOSAL_ALREADY_USED",
  "IDEMPOTENCY_KEY_REUSED",
  "PLAN_BOOKING_CONFLICT",
  "ARTIST_UNAVAILABLE",
  "CLIENT_PHONE_REQUIRED",
  "EVENT_DATE_IN_PAST",
  "EVENT_DATE_REQUIRED",
  "PARTNER_ACCOUNT_FORBIDDEN",
  "BOOKING_TARGET_NOT_FOUND",
  "CLIENT_ACCOUNT_NOT_FOUND",
  "EVENT_PLAN_NOT_FOUND",
]);

const RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_RECOVERY_TOKENS = 10;

function recoveryStorageKey(eventPlanId: number): string {
  return `epetrecere:ai-booking-recovery:v1:${eventPlanId}`;
}

function readRecoveryTokens(eventPlanId: number): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(recoveryStorageKey(eventPlanId)) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return [...new Set(
      parsed.filter(
        (token): token is string =>
          typeof token === "string" && RECOVERY_TOKEN_PATTERN.test(token),
      ),
    )].slice(-MAX_RECOVERY_TOKENS);
  } catch {
    return [];
  }
}

function writeRecoveryTokens(eventPlanId: number, tokens: readonly string[]) {
  try {
    const safe = [...new Set(tokens)]
      .filter((token) => RECOVERY_TOKEN_PATTERN.test(token))
      .slice(-MAX_RECOVERY_TOKENS);
    if (safe.length === 0) {
      window.sessionStorage.removeItem(recoveryStorageKey(eventPlanId));
    } else {
      window.sessionStorage.setItem(
        recoveryStorageKey(eventPlanId),
        JSON.stringify(safe),
      );
    }
  } catch {
    // sessionStorage may be disabled. The in-memory retry still works.
  }
}

function proposalSecondsRemaining(expiresAt: string, nowMs: number): number {
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) return 0;
  return Math.max(0, Math.ceil((expiryMs - nowMs) / 1_000));
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function AIArtistPickerChat({
  eventPlanId,
  onBookingsCreated,
}: {
  eventPlanId: number;
  /** Parent refreshes the bookings list after the AI sends requests. */
  onBookingsCreated: () => void;
}) {
  const { t } = useLocale();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingToken, setConfirmingToken] = useState<string | null>(null);
  const [pendingProposals, setPendingProposals] = useState<PendingProposal[]>([]);
  const [recoveryTokens, setRecoveryTokens] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (pendingProposals.length === 0) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pendingProposals.length]);

  useEffect(() => {
    setRecoveryTokens(readRecoveryTokens(eventPlanId));
  }, [eventPlanId]);

  function rememberRecoveryToken(token: string) {
    const next = [...new Set([...recoveryTokens, token])].slice(
      -MAX_RECOVERY_TOKENS,
    );
    // Persist before starting fetch. A reload, tab crash, or response loss can
    // then retry the same deterministic action without authorizing a new one.
    writeRecoveryTokens(eventPlanId, next);
    setRecoveryTokens(next);
  }

  function forgetRecoveryToken(token: string) {
    const next = recoveryTokens.filter((candidate) => candidate !== token);
    writeRecoveryTokens(eventPlanId, next);
    setRecoveryTokens(next);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const optimistic: Message = { role: "user", content: text };
    const nextMessages = [...messages, optimistic];
    // The API accepts a deliberately small text-only transcript. Tool blocks
    // are display artifacts, never trusted conversational authorization.
    const wireMessages = nextMessages
      .map((message) => ({
        role: message.role,
        content: typeof message.content === "string"
          ? message.content
          : message.content
              .filter(
                (block): block is Extract<ContentBlock, { type: "text" }> =>
                  block.type === "text",
              )
              .map((block) => block.text)
              .join("\n")
              .slice(0, 4_000),
      }))
      .filter(({ content }) => content.length > 0)
      .slice(-9);
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/client-artist-picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: wireMessages,
          eventPlanId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("cabinet.aiPicker.errorAi"));
        setMessages(messages);
        return;
      }
      const data: {
        messages: Message[];
        requestsSent: number;
        pendingProposals?: PendingProposal[];
      } = await res.json();
      setMessages(data.messages);
      if (data.pendingProposals?.length) {
        setPendingProposals((current) => {
          const replacedCategories = new Set(
            data.pendingProposals!.map(({ categoryId }) => categoryId),
          );
          return [
            ...current.filter(
              (proposal) => !replacedCategories.has(proposal.categoryId),
            ),
            ...data.pendingProposals!,
          ];
        });
      }
      if (data.requestsSent > 0) {
        toast.success(
          t("cabinet.aiPicker.requestsSent", { count: data.requestsSent }),
        );
        onBookingsCreated();
      }
    } catch {
      toast.error(t("cabinet.aiPicker.errorNetwork"));
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposalToken(
    proposalToken: string,
    expiresAt?: string,
  ) {
    if (busy || confirmingToken) return;
    const isRecovery = recoveryTokens.includes(proposalToken);
    if (
      expiresAt
      && proposalSecondsRemaining(expiresAt, Date.now()) === 0
      && !isRecovery
    ) {
      toast.error(t("cabinet.aiPicker.proposalExpired"));
      return;
    }
    rememberRecoveryToken(proposalToken);
    setConfirmingToken(proposalToken);
    try {
      const res = await fetch("/api/ai/client-artist-picker/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventPlanId,
          proposalToken,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const terminalFailure = typeof result.code === "string"
          && TERMINAL_CONFIRM_CODES.has(result.code);
        // Only an explicit terminal application code proves that retrying this
        // exact proposal is useless. Keep recovery for transport errors,
        // throttling/auth interruptions and 5xx responses: in those cases the
        // client may not know whether the write committed.
        if (terminalFailure) {
          forgetRecoveryToken(proposalToken);
        }
        if (terminalFailure) {
          setPendingProposals((current) =>
            current.filter(
              (proposal) => proposal.proposalToken !== proposalToken,
            ),
          );
        }
        toast.error(result.error || t("cabinet.aiPicker.confirmError"));
        return;
      }
      setPendingProposals((current) =>
        current.filter(
          (proposal) => proposal.proposalToken !== proposalToken,
        ),
      );
      forgetRecoveryToken(proposalToken);
      toast.success(
        result.created
          ? t("cabinet.aiPicker.confirmSuccess")
          : t("cabinet.aiPicker.confirmRecovered"),
      );
      onBookingsCreated();
    } catch {
      toast.error(t("cabinet.aiPicker.errorNetwork"));
    } finally {
      setConfirmingToken(null);
    }
  }

  async function confirmProposal(proposal: PendingProposal) {
    await confirmProposalToken(proposal.proposalToken, proposal.expiresAt);
  }

  // Collapsed CTA — clicking expands the full chat. Keeps the tab from
  // feeling crowded if the user doesn't want AI help.
  if (!open) {
    return (
      <Card
        className="cursor-pointer border-dashed border-gold/30 bg-gold/5 transition-all hover:border-gold/50 hover:bg-gold/10"
        onClick={() => setOpen(true)}
      >
        <CardContent className="flex items-center gap-3 py-4">
          <Wand2 className="h-5 w-5 text-gold" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {t("cabinet.aiPicker.ctaTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("cabinet.aiPicker.ctaExample")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 border-gold/30 text-gold hover:bg-gold/10"
          >
            <Sparkles className="h-3.5 w-3.5" /> {t("utilitati.open")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-gold" />
            {t("cabinet.aiPicker.title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("cabinet.aiPicker.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t("common.close")}
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="max-h-80 min-h-32 space-y-2 overflow-y-auto rounded-lg border border-border/30 bg-background/50 p-3"
        >
          {messages.length === 0 ? (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4 mt-0.5 text-gold shrink-0" />
                <p>{t("cabinet.aiPicker.intro")}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  t("cabinet.aiPicker.suggestCheap"),
                  t("cabinet.aiPicker.suggestPhotographers"),
                  t("cabinet.aiPicker.suggestDj"),
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border border-border/30 bg-accent/30 px-2.5 py-1 text-[11px] hover:border-gold/40 hover:bg-gold/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const isUser = m.role === "user";
              const textParts =
                typeof m.content === "string"
                  ? [m.content]
                  : m.content
                      .filter(
                        (b): b is Extract<ContentBlock, { type: "text" }> =>
                          b.type === "text",
                      )
                      .map((b) => b.text);
              const toolCalls =
                typeof m.content === "string"
                  ? []
                  : m.content.filter(
                      (b): b is Extract<ContentBlock, { type: "tool_use" }> =>
                        b.type === "tool_use",
                    );
              if (textParts.length === 0 && toolCalls.length === 0) return null;
              return (
                <div
                  key={i}
                  className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <Bot className="h-4 w-4 mt-1.5 text-gold shrink-0" />
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      isUser
                        ? "bg-gold/10 text-foreground"
                        : "bg-accent/40 text-foreground"
                    }`}
                  >
                    {textParts.map((part, j) => (
                      <p key={j} className="whitespace-pre-wrap">
                        {part}
                      </p>
                    ))}
                    {toolCalls.map((tc) => {
                      const label =
                        tc.name === "list_available_artists"
                          ? t("cabinet.aiPicker.toolSearching")
                          : tc.name === "prepare_booking_request"
                            ? t("cabinet.aiPicker.toolPreparing")
                            : `🛠️ ${tc.name}`;
                      return (
                        <p
                          key={tc.id}
                          className="mt-1 text-xs italic text-gold"
                        >
                          {label}
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-gold" />
              {t("cabinet.aiPicker.thinking")}
            </div>
          )}
        </div>

        {pendingProposals.length > 0 && (
          <div className="space-y-2" aria-label={t("cabinet.aiPicker.confirmationTitle")}>
            {pendingProposals.map((proposal) => {
              const secondsRemaining = proposalSecondsRemaining(
                proposal.expiresAt,
                nowMs,
              );
              const isExpired = secondsRemaining === 0;
              const isRecovery = recoveryTokens.includes(
                proposal.proposalToken,
              );
              const maskedContacts = [
                proposal.contactEmailMasked,
                proposal.contactPhoneMasked,
              ].filter((value): value is string => Boolean(value));
              return (
                <div
                  key={proposal.proposalToken}
                  className={`rounded-lg border p-3 ${
                    isExpired && !isRecovery
                      ? "border-border/40 bg-muted/30"
                      : "border-gold/35 bg-gold/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <ShieldCheck
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        isExpired && !isRecovery
                          ? "text-muted-foreground"
                          : "text-gold"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {proposal.artistName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {proposal.categoryName} · {proposal.eventDate}
                        {proposal.eventType ? ` · ${proposal.eventType}` : ""}
                        {proposal.guestCount != null
                          ? ` · ${t("cabinet.aiPicker.guests", { count: proposal.guestCount })}`
                          : ""}
                      </p>
                      {maskedContacts.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("cabinet.aiPicker.contact")}: {maskedContacts.join(" · ")}
                        </p>
                      )}
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {t("cabinet.aiPicker.message")}: {proposal.message}
                      </p>
                      <p
                        className={`mt-1 text-[11px] ${
                          isExpired && !isRecovery
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isRecovery
                          ? t("cabinet.aiPicker.recoveryPending")
                          : isExpired
                          ? t("cabinet.aiPicker.proposalExpired")
                          : t("cabinet.aiPicker.expiresIn", {
                              time: formatCountdown(secondsRemaining),
                            })}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("cabinet.aiPicker.confirmationHint")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                      disabled={
                        busy
                        || confirmingToken !== null
                        || (isExpired && !isRecovery)
                      }
                      onClick={() => void confirmProposal(proposal)}
                    >
                      {confirmingToken === proposal.proposalToken ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t(
                          isRecovery
                            ? "cabinet.aiPicker.recoveryButton"
                            : "cabinet.aiPicker.confirmButton",
                        )
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {recoveryTokens.some(
          (token) =>
            !pendingProposals.some(
              (proposal) => proposal.proposalToken === token,
            ),
        ) && (
          <div className="space-y-2" aria-label={t("cabinet.aiPicker.recoveryTitle")}>
            {recoveryTokens
              .filter(
                (token) =>
                  !pendingProposals.some(
                    (proposal) => proposal.proposalToken === token,
                  ),
              )
              .map((token) => (
                <div
                  key={token}
                  className="flex items-center gap-3 rounded-lg border border-gold/35 bg-gold/5 p-3"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {t("cabinet.aiPicker.recoveryTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("cabinet.aiPicker.recoveryPending")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                    disabled={busy || confirmingToken !== null}
                    onClick={() => void confirmProposalToken(token)}
                  >
                    {confirmingToken === token ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("cabinet.aiPicker.recoveryButton")
                    )}
                  </Button>
                </div>
              ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("cabinet.aiPicker.inputPlaceholder")}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button
            onClick={send}
            disabled={busy || !input.trim()}
            className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setPendingProposals([]);
            }}
            className="text-[11px] text-muted-foreground hover:text-gold"
          >
            {t("cabinet.aiPicker.newConversation")}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
