import { google } from "googleapis";

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "read_email",
      description:
        "Lista y filtra correos electronicos de Gmail del usuario autenticado. " +
        "Permite buscar por remitente, asunto, palabras clave o etiquetas usando la sintaxis de busqueda de Gmail " +
        "(ej: 'from:usuario@gmail.com', 'subject:factura', 'is:unread', 'newer_than:7d'). " +
        "Usar sin query para listar los correos mas recientes de la bandeja de entrada.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Consulta de busqueda en formato Gmail. Dejar vacio para listar los correos mas recientes.",
          },
          maxResults: {
            type: "integer",
            description: "Numero maximo de correos a devolver (por defecto 10, maximo 50).",
            default: 10,
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_drive",
      description:
        "Busca archivos y documentos en Google Drive del usuario autenticado usando palabras clave. " +
        "Permite filtrar por tipo de archivo (PDFs, documentos, hojas de calculo, presentaciones, imagenes). " +
        "Utiliza busqueda de texto completo sobre el nombre y contenido de los archivos.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Palabras clave para buscar en el nombre y contenido de los archivos de Drive.",
          },
          fileType: {
            type: "string",
            enum: ["pdf", "document", "spreadsheet", "presentation", "image", "any"],
            description:
              "Filtrar por tipo de archivo. 'any' devuelve todos los tipos (por defecto).",
            default: "any",
          },
          maxResults: {
            type: "integer",
            description: "Numero maximo de resultados (por defecto 10, maximo 50).",
            default: 10,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "view_calendar",
      description:
        "Lista los eventos del Google Calendar principal del usuario autenticado en un rango de tiempo especificado. " +
        "Permite filtrar por texto en el titulo o descripcion de los eventos. " +
        "Si no se especifica rango, devuelve eventos desde ahora hasta 7 dias despues.",
      parameters: {
        type: "object",
        properties: {
          timeMin: {
            type: "string",
            description:
              "Fecha/hora de inicio en formato ISO 8601 (ej: '2024-06-01T00:00:00-06:00'). Por defecto: ahora.",
          },
          timeMax: {
            type: "string",
            description:
              "Fecha/hora de fin en formato ISO 8601. Por defecto: 7 dias desde timeMin.",
          },
          maxResults: {
            type: "integer",
            description: "Numero maximo de eventos a devolver (por defecto 20, maximo 100).",
            default: 20,
          },
          query: {
            type: "string",
            description:
              "Texto para filtrar eventos cuyo titulo o descripcion contengan estas palabras.",
          },
        },
      },
    },
  },
];

const FILE_TYPE_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
  image: "image/",
};

function buildOAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

async function executeReadEmail(
  accessToken: string,
  args: { query?: string; maxResults?: number }
) {
  const auth = buildOAuthClient(accessToken);
  const gmail = google.gmail({ version: "v1", auth });

  const maxResults = Math.min(args.maxResults ?? 10, 50);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: args.query || undefined,
    maxResults,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) {
    return { count: 0, messages: [] };
  }

  const details = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const headers = detail.data.payload?.headers ?? [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value ?? "(sin asunto)";
      const from =
        headers.find((h) => h.name === "From")?.value ?? "(desconocido)";
      const date =
        headers.find((h) => h.name === "Date")?.value ?? "";

      return {
        id: msg.id,
        threadId: detail.data.threadId,
        subject,
        from,
        date,
        snippet: detail.data.snippet ?? "",
        labelIds: detail.data.labelIds ?? [],
      };
    })
  );

  return { count: details.length, messages: details };
}

async function executeSearchDrive(
  accessToken: string,
  args: { query: string; fileType?: string; maxResults?: number }
) {
  const auth = buildOAuthClient(accessToken);
  const drive = google.drive({ version: "v3", auth });

  const fileType = args.fileType ?? "any";
  const maxResults = Math.min(args.maxResults ?? 10, 50);

  const qParts: string[] = [];
  if (args.query) {
    qParts.push(`fullText contains '${args.query.replace(/'/g, "\\'")}'`);
  }
  qParts.push("trashed = false");

  if (fileType !== "any") {
    const mimeFilter = FILE_TYPE_MIME_MAP[fileType];
    if (mimeFilter) {
      if (mimeFilter.endsWith("/")) {
        qParts.push(`mimeType contains '${mimeFilter}'`);
      } else {
        qParts.push(`mimeType = '${mimeFilter}'`);
      }
    }
  }

  const res = await drive.files.list({
    q: qParts.join(" and "),
    pageSize: maxResults,
    fields:
      "files(id, name, mimeType, webViewLink, size, createdTime, modifiedTime)",
  });

  const files = (res.data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink,
    size: f.size,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
  }));

  return { count: files.length, files };
}

async function executeViewCalendar(
  accessToken: string,
  args: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    query?: string;
  }
) {
  const auth = buildOAuthClient(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date().toISOString();
  const maxResults = Math.min(args.maxResults ?? 20, 100);

  const timeMin = args.timeMin ?? now;
  const timeMax =
    args.timeMax ??
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    q: args.query || undefined,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = (res.data.items ?? []).map((ev) => ({
    id: ev.id,
    title: ev.summary ?? "(sin titulo)",
    description: ev.description ?? undefined,
    start: ev.start?.dateTime ?? ev.start?.date ?? "",
    end: ev.end?.dateTime ?? ev.end?.date ?? "",
    location: ev.location ?? undefined,
    attendees: (ev.attendees ?? []).map((a) => a.email),
  }));

  return { count: events.length, events };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export async function executeToolCall(
  toolCall: ToolCall,
  accessToken: string
): Promise<unknown> {
  const functionName = toolCall.function.name;
  let args: Record<string, unknown>;

  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Failed to parse tool arguments for ${functionName}: ${toolCall.function.arguments}`
    );
  }

  switch (functionName) {
    case "read_email":
      return executeReadEmail(accessToken, {
        query: typeof args.query === "string" ? args.query : undefined,
        maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
      });

    case "search_drive": {
      const driveQuery =
        typeof args.query === "string" ? args.query : "";
      return executeSearchDrive(accessToken, {
        query: driveQuery,
        fileType: typeof args.fileType === "string" ? args.fileType : undefined,
        maxResults:
          typeof args.maxResults === "number" ? args.maxResults : undefined,
      });
    }

    case "view_calendar":
      return executeViewCalendar(accessToken, {
        timeMin: typeof args.timeMin === "string" ? args.timeMin : undefined,
        timeMax: typeof args.timeMax === "string" ? args.timeMax : undefined,
        maxResults:
          typeof args.maxResults === "number" ? args.maxResults : undefined,
        query: typeof args.query === "string" ? args.query : undefined,
      });

    default:
      throw new Error(`Unknown tool function: ${functionName}`);
  }
}
