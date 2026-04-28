# 🦞 Nexus Agent — Workspace Orchestrator

Proyecto educativo que despliega **OpenClaw** como asistente personal de IA en un contenedor Docker local, usando **Google Gemini 1.5 Flash** como modelo de lenguaje.

## ¿Qué es OpenClaw?

[OpenClaw](https://openclaw.ai) es un framework open-source de asistente personal que actúa como motor de agente IA. Expone una interfaz web de control en el puerto `18789` y soporta múltiples canales de comunicación (WhatsApp, Telegram, Discord, WebChat...).

En este proyecto lo usamos en modo **local + WebChat** para mantener la simplicidad educativa.

## Arquitectura

```
┌─────────────────────────────────────┐
│         Tu Navegador                │
│   http://localhost:18789            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Docker Container: nexus-agent     │
│   ┌─────────────────────────────┐   │
│   │  OpenClaw Gateway           │   │
│   │  (Node.js runtime)          │   │
│   │  Puerto: 18789              │   │
│   └──────────────┬──────────────┘   │
│                  │ API calls        │
│                  ▼                  │
│   ┌─────────────────────────────┐   │
│   │  Google Gemini 1.5 Flash    │   │
│   │  (LLM externo)              │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Estructura del proyecto

```
nexus_agent/
├── docker-compose.yml    # Orquestación del contenedor
├── .env                  # Variables de entorno (NO en git)
├── .env.example          # Plantilla de variables
├── config/               # Configuración persistente de OpenClaw
├── workspace/            # Workspace del agente (memoria, archivos)
└── docs/
    └── GUIA_SETUP.md     # Guía de instalación paso a paso
```

## Inicio rápido

Consulta [`docs/GUIA_SETUP.md`](docs/GUIA_SETUP.md) para la guía completa.

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Descargar imagen y levantar
docker compose pull
docker compose up -d

# 3. Ejecutar onboarding (primera vez)
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js onboard --mode local --no-install-daemon

# 4. Abrir la interfaz
# http://localhost:18789
```

## Modelo de IA

- **Proveedor:** Google AI Studio (Gemini)
- **Modelo:** Gemini 1.5 Flash
- **Razón:** Bajo coste, alta velocidad, suficiente para uso educativo

## Tecnologías

| Componente | Tecnología |
|-----------|-----------|
| Runtime del agente | OpenClaw (Node.js) |
| Contenedorización | Docker + Docker Compose |
| Modelo LLM | Google Gemini 1.5 Flash |
| Interfaz | OpenClaw Control UI (nativa) |
| Persistencia | Volúmenes locales Docker |
