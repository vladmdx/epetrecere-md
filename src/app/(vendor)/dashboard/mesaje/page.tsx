"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, User } from "lucide-react";
import { cn } from "@/lib/utils";

const demoThreads = [
  {
    id: 1,
    clientName: "Maria Popescu",
    eventType: "Nuntă",
    lastMessage: "Bună ziua! Ați fi disponibil pe 15 august?",
    unread: 2,
    updatedAt: "10:30",
  },
  {
    id: 2,
    clientName: "SC TechCorp",
    eventType: "Corporate",
    lastMessage: "Am confirmat. Mulțumim!",
    unread: 0,
    updatedAt: "Ieri",
  },
  {
    id: 3,
    clientName: "Ion Rusu",
    eventType: "Botez",
    lastMessage: "Putem discuta detaliile?",
    unread: 1,
    updatedAt: "03 Apr",
  },
];

const demoMessages = [
  { id: 1, from: "client", text: "Bună ziua! Ați fi disponibil pe 15 august pentru o nuntă?", time: "10:25" },
  { id: 2, from: "client", text: "Suntem aproximativ 200 de invitați, locația e în Chișinău.", time: "10:26" },
];

export default function VendorMessagesPage() {
  const [selectedThread, setSelectedThread] = useState(1);
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Mesaje</h1>

      <div className="grid h-[calc(100vh-14rem)] gap-4 lg:grid-cols-3">
        {/* Thread list */}
        <div className="space-y-2 overflow-y-auto">
          {demoThreads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedThread(thread.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all",
                selectedThread === thread.id ? "border-gold bg-gold/5" : "border-border/40 hover:border-gold/30",
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{thread.clientName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{thread.updatedAt}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] mt-0.5">{thread.eventType}</Badge>
                <p className="mt-1 text-xs text-muted-foreground truncate">{thread.lastMessage}</p>
              </div>
              {thread.unread > 0 && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-background">
                  {thread.unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Chat area */}
        <Card className="lg:col-span-2 flex flex-col">
          <div className="border-b border-border/40 px-4 py-3">
            <p className="font-medium">{demoThreads.find((t) => t.id === selectedThread)?.clientName}</p>
            <p className="text-xs text-muted-foreground">{demoThreads.find((t) => t.id === selectedThread)?.eventType}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {demoMessages.map((msg) => (
              <div key={msg.id} className={cn("flex", msg.from === "me" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[70%] rounded-xl px-4 py-2.5 text-sm",
                  msg.from === "me" ? "bg-gold text-background" : "bg-accent",
                )}>
                  <p>{msg.text}</p>
                  <p className="mt-1 text-[10px] opacity-60">{msg.time}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border/40 p-4 flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Scrie un mesaj..."
              onKeyDown={(e) => e.key === "Enter" && setMessage("")}
            />
            <Button className="bg-gold text-background hover:bg-gold-dark shrink-0" size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
