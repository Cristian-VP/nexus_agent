# 📖 Guía de Setup — Nexus Agent

> Guía paso a paso para desplegar el asistente OpenClaw localmente con Docker.

---

## Prerrequisitos

Antes de empezar, asegúrate de tener instalado:

- **Docker Desktop** o **Docker Engine** (versión 24+)
- **Docker Compose** v2 (incluido en Docker Desktop)
- Una cuenta en [Google AI Studio](https://aistudio.google.com) (gratuita)

Verificar que Docker funciona:
```bash
docker --version          # Docker version 24.x.x o superior
docker compose version    # Docker Compose version v2.x.x
```

---

## Paso 1 — Obtener la API Key de Gemini

1. Ve a [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Inicia sesión con tu cuenta Google
3. Haz clic en **"Create API Key"**
4. Copia la clave generada (empieza por `AIza...`)

> 💡 **Nota:** Google AI Studio tiene una capa gratuita generosa. Gemini 1.5 Flash tiene precios muy bajos (~$0.075 por millón de tokens de entrada).

---

## Paso 2 — Configurar variables de entorno

El archivo `.env` ya existe en el proyecto. Solo necesitas abrirlo y tenerlo a mano para el onboarding.

```bash
# El archivo .env ya está creado, no necesitas modificarlo manualmente.
# El onboarding de OpenClaw guardará el token automáticamente.
cat .env
```

---

## Paso 3 — Descargar la imagen Docker

```bash
cd /home/tian/Documentos/FP/pop_claw/nexus_agent

docker compose pull
```

> ⏳ Esto descarga la imagen oficial de OpenClaw (~400-600 MB). Puede tardar varios minutos dependiendo de tu conexión.

---

## Paso 4 — Onboarding inicial de OpenClaw

Este es el paso más importante. El asistente te guiará para configurar el proveedor de IA:

```bash
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js onboard --mode local --no-install-daemon
```

**Durante el onboarding, cuando te pregunte por el proveedor de IA:**
1. Selecciona **"Google Gemini"** (o "Google AI Studio")
2. Pega tu API Key (`AIza...`)
3. Selecciona el modelo **"gemini-1.5-flash"**
4. El resto de opciones déjalas por defecto

> 💡 El onboarding generará un token de seguridad (`OPENCLAW_GATEWAY_TOKEN`) y lo escribirá en `config/.env`. Esto es normal.

---

## Paso 5 — Levantar el gateway

```bash
docker compose up -d
```

Verificar que está corriendo y sano:
```bash
docker compose ps
# Estado esperado: nexus-agent-gateway    running (healthy)

# O también:
curl http://localhost:18789/healthz
# Respuesta esperada: {"status":"ok"} o similar
```

---

## Paso 6 — Abrir la interfaz

Abre tu navegador y ve a:

```
http://localhost:18789
```

Verás el **OpenClaw Control Dashboard**. Desde aquí puedes:
- Chatear con el asistente directamente (WebChat)
- Ver el estado del agente
- Configurar canales adicionales (Telegram, Discord, etc.)

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Detener el gateway
docker compose down

# Reiniciar
docker compose restart

# Ver estado
docker compose ps

# Ejecutar comandos de OpenClaw (ej: ver configuración)
docker compose exec openclaw-gateway node dist/index.js config list
```

---

## Solución de problemas

### El contenedor no arranca
```bash
docker compose logs openclaw-gateway
```
Busca errores de configuración o de conexión con la API.

### Error de API Key
Si ves errores relacionados con Gemini/Google:
```bash
# Re-ejecutar el onboarding para actualizar la API key
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js config set model.provider gemini
```

### Puerto 18789 ocupado
Edita `docker-compose.yml` y cambia `"18789:18789"` por `"18790:18789"` y accede en el puerto nuevo.

### Resetear todo desde cero
```bash
docker compose down
rm -rf config/* workspace/*
touch config/.gitkeep workspace/.gitkeep
# Volver al Paso 4
```

---

## Arquitectura explicada (para la práctica)

```
Tu petición (navegador)
        │
        ▼
OpenClaw Gateway [Docker]
        │
        │  Analiza la petición
        │  Selecciona herramientas (Skills)
        │
        ▼
Google Gemini 1.5 Flash [API externa]
        │
        │  Genera la respuesta
        │
        ▼
OpenClaw Gateway [formatea y devuelve]
        │
        ▼
Tu navegador (respuesta)
```

**Conceptos clave:**
- **Gateway:** Servidor de control que gestiona sesiones, canales y herramientas
- **Agent:** Motor de razonamiento que usa el LLM para decidir qué hacer
- **Skills:** Extensiones que dan capacidades al agente (buscar en web, leer archivos, etc.)
- **Channels:** Canales de comunicación (WebChat, Telegram, WhatsApp...)
