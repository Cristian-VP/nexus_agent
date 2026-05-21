import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { google } from "googleapis";
import { config } from "./config";
import { ensureRedisConnected, closeRedis, redis } from "./redis";
import {
  completeOAuthLogin,
  createOAuthStateRecord,
  ensureFreshGoogleTokens,
  loadPrincipalFromSession
} from "./auth";
import { getWorkspaceSnapshot, pool, saveWorkspaceSnapshot, updateAuditLogStatus } from "./db";
import { proxyChatToOpenClaw } from "./openclaw";

type SessionData = session.Session & {
  principal?: {
    id: string;
    googleSub: string;
    email: string;
    name: string | null;
    picture: string | null;
  };
};

async function main(): Promise<void> {
  await ensureRedisConnected();

  const app = express();
  const PgStore = pgSession(session);

  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "session",
        createTableIfMissing: true
      }),
      name: "nexus_bridge_session",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        maxAge: 1000 * 60 * 60 * 24 * 30
      }
    })
  );

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/auth/google/start", async (req, res, next) => {
    try {
      const { authorizationUrl } = await createOAuthStateRecord();
      const wantsJson = req.query.format === "json" || req.accepts(["json", "html"]) === "json";

      if (wantsJson) {
        res.json({ authorizationUrl });
        return;
      }

      res.redirect(authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/google/callback", async (req, res, next) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      const state = typeof req.query.state === "string" ? req.query.state : null;

      if (!code || !state) {
        res.status(400).json({ error: "missing_code_or_state" });
        return;
      }

      const principal = await completeOAuthLogin(code, state);
      (req.session as SessionData).principal = principal;

      req.session.save(() => {
        res.redirect(config.frontendUrl);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const principal = await loadPrincipalFromSession(req);

    if (!principal) {
      res.status(401).json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      user: principal
    });
  });

  app.get("/api/workspace", async (req, res) => {
    const principal = await loadPrincipalFromSession(req);
    if (!principal) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    try {
      // Try to fetch a fresh snapshot from DB first
      const cached = await getWorkspaceSnapshot(principal.id);

      // Attempt to use Google APIs with stored tokens to return live data
      const tokens = await ensureFreshGoogleTokens(principal.id);
      const headers = {
        Authorization: `Bearer ${tokens.accessToken}`
      };

      // Gmail: list messages (recent) and fetch details
      let gmailThreads: Array<any> = [];
      try {
        const listRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8",
          { headers }
        );
        if (listRes.ok) {
          const listJson = await listRes.json();
          const messages = Array.isArray(listJson.messages) ? listJson.messages.slice(0, 8) : [];
          for (const m of messages) {
            try {
              const msgRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
                { headers }
              );
              if (!msgRes.ok) continue;
              const msg = await msgRes.json();
              const headersArr: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
              const subject = headersArr.find((h) => h.name === "Subject")?.value ?? "(sin asunto)";
              const from = headersArr.find((h) => h.name === "From")?.value ?? "(desconocido)";
              const snippet = msg.snippet ?? "";
              const updatedAt = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();
              const unread = Array.isArray(msg.labelIds) ? msg.labelIds.includes("UNREAD") : false;

              gmailThreads.push({
                id: msg.id,
                subject,
                sender: from,
                preview: snippet,
                updatedAt,
                unread
              });
            } catch (e) {
              console.warn("/api/workspace gmail msg fetch failed", e instanceof Error ? e.message : e);
            }
          }
        }
      } catch (e) {
        console.warn("/api/workspace gmail list failed", e instanceof Error ? e.message : e);
      }

      // Calendar: upcoming events
      let calendarEvents: Array<any> = [];
      try {
        const now = new Date().toISOString();
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(
            now
          )}`,
          { headers }
        );
        if (calRes.ok) {
          const calJson = await calRes.json();
          const items = Array.isArray(calJson.items) ? calJson.items : [];
          calendarEvents = items.map((ev: any) => ({
            id: ev.id,
            title: ev.summary ?? "(sin título)",
            startTime: ev.start?.dateTime ?? ev.start?.date ?? "",
            endTime: ev.end?.dateTime ?? ev.end?.date ?? "",
            location: ev.location ?? undefined
          }));
        }
      } catch (e) {
        console.warn("/api/workspace calendar fetch failed", e instanceof Error ? e.message : e);
      }

      // If we managed to get anything, build snapshot and persist
      const snapshot = {
        gmailThreads: gmailThreads.length > 0 ? gmailThreads : cached?.gmailThreads ?? [],
        calendarEvents: calendarEvents.length > 0 ? calendarEvents : cached?.calendarEvents ?? [],
        updatedAt: new Date().toISOString()
      };

      // Persist snapshot for faster reads later
      try {
        await saveWorkspaceSnapshot(principal.id, snapshot);
      } catch (e) {
        console.warn("failed to save workspace snapshot", e instanceof Error ? e.message : e);
      }

      res.json(snapshot);
      return;
    } catch (err) {
      console.warn("/api/workspace live fetch failed, falling back to cache or sample", err instanceof Error ? err.message : err);
    }

    // Fallback: return cached snapshot or sample
    const snapshot = (await getWorkspaceSnapshot(principal.id)) ?? {
      gmailThreads: [
        {
          id: "sample-thread-1",
          subject: "Proyecto Nexus Agent",
          sender: "openclaw@example.com",
          preview: "Resumen ejecutivo y próximos pasos para la arquitectura AaaS.",
          updatedAt: new Date().toISOString(),
          unread: true
        }
      ],
      calendarEvents: [
        {
          id: "sample-event-1",
          title: "Revisión de arquitectura",
          startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          location: "Google Meet"
        }
      ],
      updatedAt: new Date().toISOString()
    };

    res.json(snapshot);
  });

  app.post("/api/workspace/action/confirm", async (req, res, next) => {
    try {
      const principal = await loadPrincipalFromSession(req);
      if (!principal) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }

      const body = req.body as { actionId?: string; approved?: boolean };
      const actionId = body.actionId;
      const approved = body.approved;

      if (!actionId || typeof approved !== "boolean") {
        res.status(400).json({ error: "actionId_and_approved_required" });
        return;
      }

      const key = `action:${actionId}`;
      const rawPayload = await redis.get(key);
      if (!rawPayload) {
        res.status(404).json({ error: "action_not_found_or_expired" });
        return;
      }

      const parsed = JSON.parse(rawPayload) as {
        to: string;
        subject: string;
        body: string;
        userId: string;
        auditLogId?: string;
      };

      if (parsed.userId !== principal.id) {
        res.status(403).json({ error: "action_belongs_to_different_user" });
        return;
      }

      if (!approved) {
        await redis.del(key);
        if (parsed.auditLogId) {
          await updateAuditLogStatus(parsed.auditLogId, "REJECTED");
        }
        res.json({ status: "aborted", actionId });
        return;
      }

      try {
        const tokens = await ensureFreshGoogleTokens(principal.id);

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: tokens.accessToken });
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        const rfc2822 = [
          `To: ${parsed.to}`,
          `Subject: ${parsed.subject}`,
          "Content-Type: text/plain; charset=UTF-8",
          "MIME-Version: 1.0",
          "",
          parsed.body,
        ].join("\r\n");

        const encoded = Buffer.from(rfc2822).toString("base64url");

        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encoded },
        });

        await redis.del(key);
        if (parsed.auditLogId) {
          await updateAuditLogStatus(parsed.auditLogId, "APPROVED");
        }

        res.json({ status: "sent", actionId });
      } catch (sendError) {
        if (parsed.auditLogId) {
          await updateAuditLogStatus(
            parsed.auditLogId,
            "FAILED",
            sendError instanceof Error ? sendError.message : "Unknown send error"
          );
        }
        throw sendError;
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat", async (req, res, next) => {
    try {
      const principal = await loadPrincipalFromSession(req);
      if (!principal) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }

      const input = req.body as {
        message?: string;
        messages?: Array<{ role: string; content: string }>;
        conversationId?: string;
        workspaceContext?: unknown;
      };

      const hasMessages =
        Array.isArray(input.messages) && input.messages.length > 0;
      const hasMessage =
        typeof input.message === "string" && input.message.trim().length > 0;

      if (!hasMessages && !hasMessage) {
        res.status(400).json({ error: "message_required" });
        return;
      }

      await ensureFreshGoogleTokens(principal.id);
      await proxyChatToOpenClaw({
        userId: principal.id,
        principal,
        sessionId: req.sessionID,
        payload: {
          message: input.message,
          messages: hasMessages ? input.messages : undefined,
          conversationId: input.conversationId,
          workspaceContext: input.workspaceContext
        },
        response: res
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(message);

    if (message.toLowerCase().includes("token") || message.toLowerCase().includes("oauth")) {
      res.status(401).json({
        error: "google_token_expired_or_invalid",
        message
      });
      return;
    }

    res.status(500).json({ error: "internal_server_error", message });
  });

  const server = app.listen(config.port, () => {
    console.log(`backend-bridge listening on ${config.port}`);
  });

  const shutdown = async () => {
    server.close(() => undefined);
    await closeRedis();
    await pool.end();
  };

  process.on("SIGTERM", () => {
    void shutdown();
  });

  process.on("SIGINT", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  console.error("Fatal backend-bridge error", error);
  process.exit(1);
});