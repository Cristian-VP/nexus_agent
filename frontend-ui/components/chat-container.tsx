"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Bot, LoaderCircle, Send, Sparkles, User2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import type { AuthenticatedUser, ChatMessage } from "../lib/types";
import { markdownToHtml } from "../lib/markdown-lite";

function sanitizeContent(text: string): string {
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.content === "string") {
      return parsed.content;
    }
  } catch {
    // Not JSON, return original text
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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ message: prompt })
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
        throw new Error(`chat request failed with ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const normalized = normalizeChunk(buffer);
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  content: normalized,
                  streaming: true
                }
              : entry
          )
        );
        buffer = "";
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