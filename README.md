# Nexus Agent

Proyecto educativo que implementa una arquitectura Agent-as-a-Service (AaaS) compuesta por un frontend SPA en Next.js, un backend bridge en Express, y OpenClaw como motor de agente IA. El sistema permite que un usuario autenticado con Google interactue con su correo, calendario y Drive mediante lenguaje natural, usando un modelo LLM que decide que herramientas llamar para resolver cada solicitud.

## Arquitectura general

El proyecto sigue un patron de tres capas desplegado sobre Docker Compose con cinco servicios:

```
Tu Navegador (localhost:3000)
       |
       v
frontend-ui         Next.js 15 SPA
  | - ChatContainer     (chat streaming con SSE)
  | - WorkspacePanel    (panel lateral con Gmail y Calendar)
  | - Proxy BFF         (rutas /api/* que reenvian al backend)
       |
       v
backend-bridge      Express + TypeScript
  | - OAuth 2.0 Google  (PKCE, token refresh, cifrado AES-256-GCM)
  | - PostgreSQL         (usuarios, tokens, snapshots del workspace)
  | - Redis              (cache de estado OAuth)
  | - Proxy LLM          (tool-calling loop contra API de Opencode)
       |
       v
LLM externo         Opencode API (modelo kimi-k2.6)
  | - Recibe mensajes + tool definitions
  | - Devuelve tool_calls o respuesta final
       |
       v
Google APIs         Gmail, Calendar, Drive (REST v1/v3)
```

El frontend nunca habla directamente con el modelo de IA ni con las APIs de Google. Toda la orquestacion pasa por el backend bridge, que mantiene las sesiones, gestiona los tokens, ejecuta las herramientas y devuelve la respuesta en streaming.

## Servicios

### openclaw-gateway

Contenedor basado en la imagen oficial `ghcr.io/openclaw/openclaw:latest`. Expone el puerto `18789` en la red interna y funciona como runtime del agente. Su configuracion se persiste en `./config` y su workspace (memoria, archivos) en `./workspace`. El backend bridge se comunica con el via HTTP, pero la logica de chat y tool-calling se implementa en el bridge, no en OpenClaw.

### postgres

PostgreSQL 16 Alpine. Almacena tres tablas (ver seccion Esquema de base de datos mas abajo) y ejecuta `schema.sql` al iniciar por primera vez. La sesion de Express se persiste aqui mediante `connect-pg-simple`.

### redis

Redis 7 Alpine con persistencia AOF. Se usa exclusivamente como cache volatil para el estado OAuth durante el flujo PKCE. Las claves tienen TTL configurable.

### backend-bridge

El nucleo de la aplicacion. Servidor Express escrito en TypeScript que expone estas rutas:

| Ruta | Metodo | Proposito |
|------|--------|-----------|
| `/healthz` | GET | Health check |
| `/api/auth/google/start` | GET | Inicia flujo OAuth (redirige a Google) |
| `/api/auth/google/callback` | GET | Callback OAuth, completa el login |
| `/api/auth/me` | GET | Devuelve el usuario autenticado actual |
| `/api/workspace` | GET | Snapshot de Gmail y Calendar del usuario |
| `/api/chat` | POST | Chat con el agente (streaming SSE) |

La ruta `/api/chat` es la mas relevante. Al recibir un mensaje, el backend construye un prompt de sistema, adjunta las tool definitions (`read_email`, `search_drive`, `view_calendar`) y entra en un bucle de hasta 10 iteraciones donde el LLM puede decidir entre responder directamente o invocar herramientas. Cada tool call se ejecuta contra las APIs de Google usando el access token del usuario autenticado.

### frontend-ui

SPA construida con Next.js 15 (App Router) y Tailwind CSS. Dos componentes principales:

- **ChatContainer**: Gestiona el chat. Envia mensajes via POST a `/api/chat`, recibe la respuesta en streaming SSE, la normaliza (elimina prefijos `data:`, filtra marcadores `[DONE]`, extrae el campo `content` de respuestas JSON) y renderiza el texto como HTML usando un parser Markdown ligero propio.
- **WorkspacePanel**: Panel lateral que consulta `/api/workspace` cada 15 segundos y muestra los hilos recientes de Gmail y los proximos eventos de Calendar.

El frontend incluye un proxy BFF (Backend For Frontend) en sus api routes de Next.js. Rutas como `/api/chat` o `/api/auth/me` simplemente reenvian la peticion al backend bridge con las cookies de sesion.

## Autenticacion y seguridad

### Flujo OAuth 2.0 con PKCE

El backend implementa el Authorization Code Flow con PKCE (Proof Key for Code Exchange), el metodo recomendado por Google para aplicaciones que no pueden almacenar un client secret de forma segura en el cliente:

1. El frontend redirige al usuario a `/api/auth/google/start`.
2. El backend genera un `code_verifier` aleatorio (48 bytes), calcula su `code_challenge` via SHA-256, y almacena el `code_verifier` en Redis con TTL de 600 segundos.
3. Google redirige al usuario de vuelta a `/api/auth/google/callback` con un `code` y el `state`.
4. El backend valida el `state` contra Redis, intercambia el `code` por tokens (access + refresh), obtiene el perfil del usuario desde Google, y persiste todo en PostgreSQL.
5. El usuario queda autenticado por sesion (cookie `nexus_bridge_session`).

Los scopes solicitados son `openid`, `email`, `profile`, `gmail.readonly`, `gmail.send`, `calendar.readonly` y `drive.readonly`.

### Cifrado de tokens en reposo

Los access tokens y refresh tokens de Google se almacenan cifrados en PostgreSQL usando AES-256-GCM. La clave de cifrado se deriva de `TOKEN_ENCRYPTION_KEY` mediante SHA-256. El formato de almacenamiento es `iv.tag.payload` codificado en base64.

### Sesiones

Express gestiona las sesiones con `express-session` y `connect-pg-simple`, almacenandolas en la tabla `session` de PostgreSQL. La cookie de sesion tiene flags `httpOnly`, `sameSite: lax`, y `secure` (configurable via `COOKIE_SECURE`). La duracion maxima es de 30 dias.

### Refresco proactivo de tokens

Antes de cualquier llamada a las APIs de Google, el backend verifica si el access token expira en menos de `GOOGLE_REFRESH_LEEWAY_SECONDS` (por defecto 60 segundos). Si es asi, lo renueva usando el refresh token y persiste los nuevos valores.

## Bucle de tool calling

El corazon del agente esta en `backend-bridge/src/openclaw.ts`. El flujo es:

1. Se construye un array de mensajes: system prompt + mensaje del usuario + contexto opcional del workspace.
2. Se llama al endpoint de chat completions de Opencode con `stream: false` y las tool definitions inyectadas.
3. Si el LLM responde con `tool_calls`, el backend ejecuta cada tool contra las APIs de Google, anhade los resultados como mensajes `role: tool`, y repite desde el paso 2.
4. Si el LLM responde con `content` (texto final), se envia al frontend via SSE.

El bucle tiene un maximo de 10 iteraciones para evitar bucles infinitos. Si tras esas iteraciones no hay respuesta, se devuelve un mensaje de fallback.

### Herramientas disponibles

| Tool | API de Google | Parametros |
|------|---------------|------------|
| `read_email` | Gmail v1 | `query` (busqueda Gmail), `maxResults` (1-50) |
| `search_drive` | Drive v3 | `query` (texto completo), `fileType` (pdf/document/spreadsheet/presentation/image/any), `maxResults` |
| `view_calendar` | Calendar v3 | `timeMin`, `timeMax` (ISO 8601), `maxResults`, `query` |

## Esquema de base de datos

Las tablas se crean automaticamente desde `backend-bridge/sql/schema.sql` al iniciar el contenedor de PostgreSQL:

```sql
google_users (id UUID PK, google_sub TEXT UNIQUE, email TEXT UNIQUE, name, picture, timestamps)
google_tokens (google_user_id UUID PK FK, access_token_encrypted, refresh_token_encrypted, id_token_encrypted, scopes, token_type, expires_at, timestamps)
workspace_snapshots (google_user_id UUID PK FK, snapshot JSONB, timestamps)
```

La tabla `session` es gestionada por `connect-pg-simple` y se crea automaticamente si no existe.

## Estructura del proyecto

```
nexus_agent/
backend-bridge/              Express + TypeScript
  src/
    index.ts                 Servidor Express, rutas, middleware de error
    config.ts                Lectura tipada de variables de entorno
    auth.ts                  Flujo OAuth 2.0 PKCE, token refresh
    db.ts                    Queries PostgreSQL, cifrado/descifrado de tokens
    crypto.ts                Cifrado AES-256-GCM
    redis.ts                 Cliente Redis, connect/quit
    openclaw.ts              Proxy al LLM, bucle de tool calling, streaming SSE
    tools.ts                 Tool definitions, ejecucion contra Google APIs
  sql/schema.sql             DDL de PostgreSQL
  Dockerfile                 Multi-stage build (node:20-alpine)

frontend-ui/                 Next.js 15 SPA
  app/
    page.tsx                 Layout principal (ChatContainer + WorkspacePanel)
    layout.tsx               Root layout, fuentes, metadata
    globals.css              Tailwind + variables de tema oscuro
    api/                     Proxy BFF hacia backend-bridge
      chat/route.ts          POST /api/chat
      auth/google/           OAuth start y callback
      workspace/route.ts     GET /api/workspace
      health/route.ts        GET /api/health
  components/
    chat-container.tsx       Chat UI, streaming SSE, normalizacion de chunks
    workspace-panel.tsx      Panel lateral Gmail + Calendar
    ui/                      Primitivas (Button, Card, Input)
  lib/
    markdown-lite.ts         Parser Markdown a HTML (bold, italic, listas, links, code)
    types.ts                 Tipos compartidos TypeScript
    backend.ts               Resolvedor de URL del backend
    cn.ts                    Utilidad clsx + tailwind-merge
  Dockerfile                 Multi-stage build con Next.js standalone

config/                      Configuracion persistente de OpenClaw (volumen)
workspace/                   Workspace del agente (memoria, archivos)

.env.example                 Plantilla de variables de entorno
docker-compose.yml           Orquestacion de los 5 servicios
```

## Configuracion

Todas las variables de entorno necesarias estan documentadas en `.env.example`. Las mas relevantes:

| Variable | Servicio | Descripcion |
|----------|----------|-------------|
| `OPENCLAW_GATEWAY_TOKEN` | gateway, bridge | Token de seguridad generado en el onboarding |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | bridge | Credenciales OAuth de Google Cloud |
| `SESSION_SECRET` | bridge | Secreto para firmar cookies de sesion |
| `TOKEN_ENCRYPTION_KEY` | bridge | Clave para cifrar tokens Google en BD |
| `OPENCODE_BASE_URL` | bridge | URL base de la API de Opencode |
| `OPENCODE_API_KEY` | bridge | API key para autenticar contra Opencode |
| `DATABASE_URL` | bridge | Cadena de conexion PostgreSQL |
| `REDIS_URL` | bridge | Cadena de conexion Redis |
| `BACKEND_BRIDGE_URL` | frontend | URL del backend bridge (interno o local) |

## Inicio rapido

```bash
cp .env.example .env
# Editar .env con las credenciales reales

docker compose pull
docker compose up -d

# Onboarding inicial de OpenClaw (solo la primera vez)
docker compose run --rm --no-deps --entrypoint node openclaw-gateway \
  dist/index.js onboard --mode local --no-install-daemon

# La interfaz estara en http://localhost:3000
```

## Desarrollo local

Para trabajar en el frontend fuera de Docker:

```bash
cd frontend-ui
npm install
npm run dev
```

El frontend usara `http://localhost:4000` como backend bridge por defecto. Para que funcione, el backend bridge debe estar publicando el puerto 4000 (el `docker-compose.yml` ya lo hace). Si necesitas otro destino, define `BACKEND_BRIDGE_URL` en `frontend-ui/.env.local`.

## Decisiones tecnicas

**Por que SSE en lugar de WebSockets.** El chat es unidireccional (servidor a cliente) y no necesita canal persistente. SSE es mas simple, funciona sobre HTTP/1.1 sin configuracion extra, y permite reconexion automatica.

**Por que PKCE en lugar de implicit flow.** El implicit flow esta depreciado por Google. PKCE no requiere client secret en el frontend y es el estandar actual para SPAs y aplicaciones moviles.

**Por que cifrar los tokens en BD.** PostgreSQL ya tiene cifrado a nivel de sistema de archivos, pero el cifrado a nivel de aplicacion (AES-256-GCM) protege contra accesos no autorizados a la base de datos o a los backups. La clave de cifrado nunca toca el disco en texto plano fuera de las variables de entorno.

**Por que streaming false en las llamadas al LLM.** El tool-calling requiere la respuesta completa para decidir si hay tool_calls que ejecutar. No se puede hacer streaming parcial con herramientas intermedias.

**Por que un parser Markdown propio en lugar de una libreria.** Las librerias de Markdown son pesadas (easily 50-200 KB) y ofrecen funciones que no se necesitan (tablas, footnotes, HTML arbitrario). El parser propio pesa menos de 2 KB, cubre los casos de uso reales del chat (negrita, cursiva, listas, enlaces, codigo inline), y tiene control total sobre el HTML generado para prevenir XSS.

**Por que PostgreSQL en lugar de SQLite.** El proyecto se ejecuta en Docker con multiples servicios. PostgreSQL maneja mejor la concurrencia (el pool de conexiones de `pg` es mas robusto) y `connect-pg-simple` tiene soporte nativo. Para un despliegue monolitico sin Docker, SQLite seria una alternativa valida.

## Limitaciones y trabajo futuro

- El sistema no implementa memoria de conversacion entre sesiones. Cada peticion al chat es independiente; el historial vive solo en el estado del frontend.
- Las herramientas no soportan operaciones de escritura mas alla de `gmail.send`. Crear eventos de Calendar o subir archivos a Drive requeriria scopes adicionales y logica de confirmacion.
- El rate limiting se delega a las APIs de Google y Opencode. No hay throttling propio en el backend bridge.
- No hay tests automatizados. El proyecto tiene fines educativos y prioriza la claridad del codigo sobre la cobertura.
