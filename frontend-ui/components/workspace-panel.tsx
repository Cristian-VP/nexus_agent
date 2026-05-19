"use client";

import { useEffect, useState, type ComponentType } from "react";
import { CalendarDays, Inbox, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { WorkspaceSnapshot } from "../lib/types";

export function WorkspacePanel() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "anonymous">("loading");

  async function loadWorkspace(): Promise<void> {
    try {
      const response = await fetch("/api/workspace", {
        credentials: "include"
      });

      if (response.status === 401) {
        setStatus("anonymous");
        setWorkspace(null);
        return;
      }

      const payload = (await response.json()) as WorkspaceSnapshot;
      setWorkspace(payload);
      setStatus("ready");
    } catch {
      setStatus("anonymous");
    }
  }

  useEffect(() => {
    void loadWorkspace();
    const interval = window.setInterval(() => void loadWorkspace(), 15000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <Card className="flex h-full flex-col overflow-hidden border-white/8 bg-white/6">
      <div className="border-b border-white/8 bg-black/20 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-orange-300" />
              WorkspacePanel
            </div>
            <p className="mt-1 text-sm text-slate-300">
              Resumen de Gmail y Calendar sincronizado desde el backend bridge.
            </p>
          </div>
          <Button variant="ghost" onClick={() => void loadWorkspace()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refrescar
          </Button>
        </div>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-slate-400">
          {status === "ready" ? `Actualizado ${workspace?.updatedAt ?? "ahora"}` : "Sin sesión activa"}
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <PanelTitle icon={Inbox} label="Hilos de Gmail" />
          <div className="space-y-3">
            {(workspace?.gmailThreads ?? []).map((thread) => (
              <article key={thread.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{thread.subject}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">
                      {thread.sender}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] ${thread.unread ? "bg-orange-400/15 text-orange-100" : "bg-white/6 text-slate-300"}`}>
                    {thread.unread ? "Nuevo" : "Leído"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{thread.preview}</p>
                <p className="mt-3 font-mono text-[11px] text-slate-500">{thread.updatedAt}</p>
              </article>
            ))}
            {(workspace?.gmailThreads?.length ?? 0) === 0 ? (
              <EmptyState label="No hay hilos sincronizados todavía." />
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <PanelTitle icon={CalendarDays} label="Eventos de Calendar" />
          <div className="space-y-3">
            {(workspace?.calendarEvents ?? []).map((event) => (
              <article key={event.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <h3 className="text-sm font-semibold text-white">{event.title}</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-300">
                  <span>{event.startTime}</span>
                  <span>{event.endTime}</span>
                  {event.location ? <span>{event.location}</span> : null}
                </div>
              </article>
            ))}
            {(workspace?.calendarEvents?.length ?? 0) === 0 ? (
              <EmptyState label="No hay eventos sincronizados todavía." />
            ) : null}
          </div>
        </section>
      </div>
    </Card>
  );
}

function PanelTitle({ icon: Icon, label }: { icon: ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-400">
      <Icon className="h-4 w-4 text-cyan-200" />
      {label}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-white/8 px-4 py-5 text-sm text-slate-400">{label}</div>;
}