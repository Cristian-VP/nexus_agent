import { ChatContainer } from "../components/chat-container";
import { WorkspacePanel } from "../components/workspace-panel";

export default function HomePage() {
  return (
    <main className="h-screen bg-mesh-gradient text-white">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-6 overflow-hidden px-4 py-6 lg:px-8">
        <header className="rounded-3xl border border-white/8 bg-white/5 p-6 shadow-glow backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-orange-200/80">
                Nexus Agent / AaaS
              </p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Orquesta Gmail, Calendar y Drive desde una sola superficie.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Frontend en Next.js 15 con streaming en tiempo real y un backend bridge que
                autentica con Google, cifra tokens y proxyfía las solicitudes hacia OpenClaw.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[460px]">
              <StatCard label="Arquitectura" value="Microservicios" />
              <StatCard label="Seguridad" value="OAuth 2.0" />
              <StatCard label="Modelo" value="Gemini Flash" />
            </div>
          </div>
        </header>

        <section className="grid flex-1 min-h-0 gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <ChatContainer />
          <WorkspacePanel />
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 shadow-glow backdrop-blur-md">
      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}