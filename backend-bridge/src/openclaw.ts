import crypto from "node:crypto";
import type { Response } from "express";
import { config } from "./config";
import { createAuditLog, getGoogleTokens } from "./db";
import { redis } from "./redis";
import {
  TOOL_DEFINITIONS,
  executeToolCall,
  type ToolCall,
} from "./tools";

export interface ChatPayload {
  message?: string;
  messages?: Array<{ role: string; content: string }>;
  conversationId?: string;
  workspaceContext?: unknown;
}

export async function proxyChatToOpenClaw(params: {
  userId: string;
  principal: { email: string; name: string | null };
  sessionId: string;
  payload: ChatPayload;
  response: Response;
}): Promise<void> {
  try {
    const tokens = await getGoogleTokens(params.userId);
    if (!tokens) {
      throw new Error("No Google tokens stored for the current session");
    }

    const accessToken = tokens.accessToken;
    const upstreamUrl = `${config.opencodeBaseUrl}/v1/chat/completions`;

    let systemContent =
      "Eres Nexus Agent, un asistente integrado con Google Workspace. " +
      "Tienes herramientas activas para leer correos (read_email), buscar en Drive (search_drive) " +
      "y ver el calendario (view_calendar). " +
      "AHORA TAMBIÉN PUEDES crear borradores (gmail_create_draft), " +
      "crear o mover eventos de calendario (create_calendar_event, move_calendar_event) " +
      "y ENVIAR CORREOS directamente. " +
      "Si el usuario te pide redactar y enviar un correo, DEBES usar la herramienta " +
      "'gmail_request_send_email' sin dudarlo. El sistema se encargará de pedir la " +
      "confirmación humana de forma segura por ti. " +
      "No inventes respuestas ni uses conocimiento general; siempre consulta las APIs con las tools. " +
      "Si encuentras un archivo en Drive mediante 'search_drive' y necesitas conocer " +
      "su contenido, usa 'read_drive_file' con el ID del archivo.";

    if (params.payload.workspaceContext) {
      systemContent +=
        "\n\nContexto del espacio de trabajo:\n" +
        JSON.stringify(params.payload.workspaceContext, null, 2);
    }

    const messages: Array<Record<string, unknown>> = [
      {
        role: "system",
        content: systemContent,
      },
    ];

    if (params.payload.messages && params.payload.messages.length > 0) {
      for (const m of params.payload.messages) {
        messages.push({ role: m.role, content: m.content });
      }
    } else {
      messages.push({
        role: "user",
        content: params.payload.message ?? "",
      });
    }

    const maxIterations = 10;
    let finalContent = "";

    for (let i = 0; i < maxIterations; i++) {
      const upstreamRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${config.opencodeApiKey}`,
        },
        body: JSON.stringify({
          model: "kimi-k2.6",
          messages,
          tools: TOOL_DEFINITIONS,
          stream: false,
        }),
      });

      const responseText = await upstreamRes.text();

      if (!upstreamRes.ok) {
        console.error(
          `[Opencode API error ${upstreamRes.status} iter ${i}]:`,
          responseText.slice(0, 1000)
        );
        throw new Error(
          `Opencode API error ${upstreamRes.status}: ${responseText.slice(0, 500)}`
        );
      }

      const ct = upstreamRes.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        console.error(
          `[Opencode unexpected content-type iter ${i}]:`,
          ct,
          responseText.slice(0, 500)
        );
        throw new Error(`Opencode returned unexpected content-type: ${ct}`);
      }

      console.log(
        `[Opencode raw response iter ${i}]:`,
        responseText.slice(0, 500)
      );

      const responseData = JSON.parse(responseText) as {
        choices?: Array<{
          message?: {
            role?: string;
            content?: string | null;
            tool_calls?: ToolCall[];
          };
        }>;
      };

      const assistantMessage = responseData.choices?.[0]?.message;

      if (!assistantMessage) {
        throw new Error("Opencode response missing choices[0].message");
      }

      console.log(
        `[LLM Response iter ${i}]:`,
        JSON.stringify({
          role: assistantMessage.role,
          content: assistantMessage.content,
          tool_calls_count: assistantMessage.tool_calls?.length ?? 0,
        })
      );

      const toolCalls = assistantMessage.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        const sendEmailCall = toolCalls.find(
          (tc) => tc.function.name === "gmail_request_send_email"
        );

        if (sendEmailCall) {
          let args: { to?: string; subject?: string; body?: string };
          try {
            args = JSON.parse(sendEmailCall.function.arguments) as {
              to?: string;
              subject?: string;
              body?: string;
            };
          } catch {
            throw new Error("Failed to parse gmail_request_send_email arguments");
          }

          const to = args.to ?? "";
          const subject = args.subject ?? "";
          const body = args.body ?? "";

          const actionId = crypto.randomUUID();
          const auditLogId = await createAuditLog(
            params.userId,
            "gmail_request_send_email",
            args as Record<string, unknown>,
            "PENDING"
          );

          await redis.set(
            `action:${actionId}`,
            JSON.stringify({
              to,
              subject,
              body,
              userId: params.userId,
              auditLogId,
            }),
            { EX: 900 }
          );

          params.response.setHeader("content-type", "text/event-stream");
          params.response.write(
            `data: ${JSON.stringify({
              type: "action_required",
              actionId,
              details: { to, subject },
            })}\n\n`
          );
          params.response.write(`data: [DONE]\n\n`);
          params.response.end();
          return;
        }

        messages.push({
          role: "assistant",
          content: assistantMessage.content,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          try {
            const result = await executeToolCall(tc, accessToken);
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            await createAuditLog(params.userId, tc.function.name, args, "SUCCESS");
            console.log(`[Tool Result - ${tc.function.name}]:`, result);
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: typeof result === "string" ? result : JSON.stringify(result),
            });
          } catch (execError) {
            let args: Record<string, unknown>;
            try {
              args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            } catch {
              args = {};
            }
            await createAuditLog(
              params.userId,
              tc.function.name,
              args,
              "FAILED",
              execError instanceof Error ? execError.message : "Unknown tool execution error"
            );
            throw execError;
          }
        }

        continue;
      }

      finalContent = assistantMessage.content ?? "";
      break;
    }

    if (!finalContent) {
      finalContent =
        "No pude procesar tu solicitud. Por favor intenta de nuevo.";
    }

    console.log("[SSE finalContent]:", finalContent);

    params.response.setHeader("content-type", "text/event-stream");
    params.response.write(
      `data: ${JSON.stringify({ type: "text", content: finalContent })}\n\n`
    );
    params.response.write(`data: [DONE]\n\n`);
    params.response.end();
  } catch (error) {
    console.error("[openclaw] proxy error:", error);
    params.response.status(500).json({
      error: "openclaw_proxy_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
