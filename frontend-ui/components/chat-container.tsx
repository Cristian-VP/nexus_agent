"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bot, LoaderCircle, Send, Sparkles, User2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import type { ActionRequired, AuthenticatedUser, ChatMessage } from "../lib/types";
import { markdownToHtml } from "../lib/markdown-lite";

function sanitizeContent(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.content === "string") {
        return parsed.content;
      }
    } catch {
      // Not valid JSON, return original text
    }
  }
  return text;
}

function normalizeChunk(chunk: string): string {
  const text = chunk
    .split("\n")
    .map((line) => (line.startsWith("data:") ? line.slice(5).trimStart() : line))
    .filter((line) => line !== "[DONE]")
    .join("\n");
  return sanitizeContent(text);
}

export function ChatContainer() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Conecta tu cuenta de Google para empezar. Puedo resumir correos, preparar eventos y coordinar el workspace desde una sola conversación.",
      streaming: false
    }
  ]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "anonymous">(
    "loading"
  );
  const [reauthMessage, setReauthMessage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession(): Promise<void> {
      try {
        const response = await fetch("/api/auth/me", {
          signal: controller.signal,
          credentials: "include"
        });

        if (!response.ok) {
          setAuthStatus("anonymous");
          return;
        }

        const payload = (await response.json()) as { user?: AuthenticatedUser };
        setUser(payload.user ?? null);
        setAuthStatus(payload.user ? "authenticated" : "anonymous");
      } catch {
        setAuthStatus("anonymous");
      }
    }

    void loadSession();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!message.trim() || isLoading) {
      return;
    }

    const prompt = message.trim();
    const assistantId = crypto.randomUUID();

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt, streaming: false },
      { id: assistantId, role: "assistant", content: "", streaming: true }
    ]);
    setMessage("");
    setIsLoading(true);
    setReauthMessage(null);

    try {
      const historyWithNewMsg: Array<{ role: string; content: string }> = [
        ...messages
          .filter((m) => m.content.trim() !== "")
          .map(({ role, content }) => ({ role, content })),
        { role: "user", content: prompt }
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ messages: historyWithNewMsg })
      });

      if (response.status === 401) {
        setReauthMessage("La sesión de Google expiró o ya no es válida. Vuelve a conectarte.");
        setAuthStatus("anonymous");
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  content:
                    "No pude completar la solicitud porque el token de Google expiró. Vuelve a iniciar sesión para continuar.",
                  streaming: false
                }
              : entry
          )
        );
        return;
      }

      if (!response.ok || !response.body) {
        console.error("[chat] upstream error:", response.status);
        throw new Error(`chat request failed with ${response.status}`);
      }

      console.log("[chat] upstream OK, reading SSE stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trimStart();
          if (!payload || payload === "[DONE]") continue;

          console.log("[SSE received]:", payload);

          try {
            const parsed = JSON.parse(payload);
            if (parsed?.type === "action_required") {
              setMessages((current) =>
                current.map((entry) =>
                  entry.id === assistantId
                    ? {
                        ...entry,
                        content: "",
                        streaming: false,
                        action: parsed as ActionRequired
                      }
                    : entry
                )
              );
              continue;
            }
          } catch {
            // Not JSON, treat as text
          }

          const text = sanitizeContent(payload);
          if (text) {
            setMessages((current) =>
              current.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      content: text,
                      streaming: true
                    }
                  : entry
              )
            );
          }
        }
      }

      setMessages((current) =>
        current.map((entry) =>
          entry.id === assistantId
            ? {
                ...entry,
                streaming: false
              }
            : entry
        )
      );
    } catch (error) {
      setMessages((current) =>
        current.map((entry) =>
          entry.id === assistantId
            ? {
                ...entry,
                content:
                  error instanceof Error
                    ? error.message
                    : "Error inesperado al hablar con el backend bridge.",
                streaming: false
              }
            : entry
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden border-white/8 bg-white/6">
      <div className="border-b border-white/8 bg-black/20 px-5 py-4 backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-orange-300" />
              ChatContainer
            </div>
            <p className="mt-1 text-sm text-slate-300">
              Streaming, OAuth y proxy seguro al gateway de OpenClaw.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {authStatus === "authenticated"
                ? `Conectado como ${user?.email ?? "usuario"}`
                : "Sesión no iniciada"}
            </div>
            <Button variant="secondary" onClick={() => (window.location.href = "/api/auth/google/start")}>
              Conectar Google
            </Button>
          </div>
        </div>
        {reauthMessage ? (
          <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {reauthMessage}
          </p>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((entry) => (
          <MessageBubble key={entry.id} message={entry} />
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/8 bg-black/20 p-4 backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={message}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setMessage(event.target.value)}
            placeholder="Pide un resumen, agenda una reunión o revisa un hilo de Gmail..."
            className="h-12 flex-1"
          />
          <Button type="submit" disabled={isLoading} className="h-12 min-w-28">
            {isLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [actionStatus, setActionStatus] = useState<"pending" | "sent" | "aborted" | "error" | null>(
    message.actionStatus ?? null
  );

  async function handleActionConfirm(approved: boolean): Promise<void> {
    if (!message.action) return;
    setActionStatus("pending");

    try {
      const res = await fetch("/api/workspace/action/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          actionId: message.action.actionId,
          approved
        })
      });

      if (!res.ok) {
        setActionStatus("error");
        return;
      }

      const data = (await res.json()) as { status?: string };
      if (data.status === "sent") {
        setActionStatus("sent");
      } else if (data.status === "aborted") {
        setActionStatus("aborted");
      } else {
        setActionStatus("error");
      }
    } catch {
      setActionStatus("error");
    }
  }

  if (message.action && !actionStatus) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[92%] rounded-3xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 shadow-glow sm:max-w-[78%]">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-amber-300">
            <Bot className="h-3.5 w-3.5 text-amber-200" />
            Confirmación requerida
          </div>
          <p className="mb-3 text-sm leading-6 text-slate-100">
            El asistente quiere enviar el siguiente correo:
          </p>
          <div className="mb-4 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
            <div>
              <span className="font-semibold text-slate-400">Para:</span>{" "}
              {message.action.details.to}
            </div>
            <div>
              <span className="font-semibold text-slate-400">Asunto:</span>{" "}
              {message.action.details.subject}
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="border-green-400/40 bg-green-500/10 text-green-100 hover:bg-green-500/20"
              onClick={() => void handleActionConfirm(true)}
            >
              Aprobar
            </Button>
            <Button
              variant="secondary"
              className="border-red-400/40 bg-red-500/10 text-red-100 hover:bg-red-500/20"
              onClick={() => void handleActionConfirm(false)}
            >
              Rechazar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (message.action && actionStatus) {
    const badge = (() => {
      switch (actionStatus) {
        case "sent":
          return {
            label: "Correo Enviado",
            color: "border-green-400/30 bg-green-500/10 text-green-200"
          };
        case "aborted":
          return {
            label: "Acción Cancelada",
            color: "border-slate-400/30 bg-slate-500/10 text-slate-200"
          };
        case "error":
          return {
            label: "Error",
            color: "border-red-400/30 bg-red-500/10 text-red-200"
          };
        default:
          return {
            label: "Procesando...",
            color: "border-amber-400/30 bg-amber-500/10 text-amber-200"
          };
      }
    })();

    return (
      <div className="flex justify-start">
        <div className="max-w-[92%] rounded-3xl border border-white/8 bg-white/8 px-4 py-3 shadow-glow sm:max-w-[78%]">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">
            <Bot className="h-3.5 w-3.5 text-cyan-200" />
            OpenClaw
          </div>
          <div className="mb-3 text-sm text-slate-300">
            Correo a{" "}
            <span className="font-medium text-slate-100">
              {message.action.details.to}
            </span>
            {" — "}
            <span className="italic">{message.action.details.subject}</span>
          </div>
          <div
            className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${badge.color}`}
          >
            {badge.label}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-3xl border px-4 py-3 shadow-glow sm:max-w-[78%] ${
          isUser ? "border-orange-400/30 bg-orange-400/10" : "border-white/8 bg-white/8"
        }`}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">
          {isUser ? (
            <User2 className="h-3.5 w-3.5 text-orange-200" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-cyan-200" />
          )}
          {isUser ? "Tu mensaje" : "OpenClaw"}
        </div>
        {message.content ? (
          <div
            className="text-sm leading-6 text-slate-100"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(message.content) }}
          />
        ) : message.streaming ? (
          <div className="text-sm leading-6 text-slate-100">Escribiendo...</div>
        ) : null}
      </div>
    </div>
  );
}