import type { Response } from "express";
import { config } from "./config";
import { getGoogleTokens } from "./db";
import {
  TOOL_DEFINITIONS,
  executeToolCall,
  type ToolCall,
} from "./tools";

export interface ChatPayload {
  message: string;
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

    const messages: Array<Record<string, unknown>> = [
      {
        role: "user",
        content: params.payload.message,
      },
    ];

    let systemContent =
      "Eres un asistente con acceso directo a Gmail, Google Drive y Google Calendar del usuario autenticado. " +
      "IMPORTANTE: Cuando el usuario pregunte sobre sus correos, archivos o eventos, DEBES usar " +
      "las herramientas disponibles (read_email, search_drive, view_calendar) para consultar los datos reales. " +
      "No inventes respuestas ni uses conocimiento general; siempre consulta las APIs con las tools.";

    if (params.payload.workspaceContext) {
      systemContent +=
        "\n\nContexto del espacio de trabajo:\n" +
        JSON.stringify(params.payload.workspaceContext, null, 2);
    }

    messages.unshift({
      role: "system",
      content: systemContent,
    });

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
        throw new Error(
          `Opencode API error ${upstreamRes.status}: ${responseText.slice(0, 500)}`
        );
      }

      const ct = upstreamRes.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`Opencode returned unexpected content-type: ${ct}`);
      }

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

      const toolCalls = assistantMessage.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: assistantMessage.content,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          const result = await executeToolCall(tc, accessToken);
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
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

    params.response.setHeader("content-type", "text/event-stream");
    params.response.write(`data: ${finalContent}\n\n`);
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
