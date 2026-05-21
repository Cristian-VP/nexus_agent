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
        "Usar sin query para listar los correos mas recientes de la bandeja de entrada. " +
        "LEE CUIDADOSAMENTE los cuerpos de los correos antes de responder. " +
        "If the user asks for 'received' emails, 'inbox', or general emails without specifying, YOU MUST append 'in:inbox' to your query.",
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
  {
    type: "function" as const,
    function: {
      name: "gmail_create_draft",
      description:
        "Crea un borrador de correo electronico en la bandeja de Gmail del usuario autenticado. " +
        "Permite especificar destinatario (to), asunto (subject), cuerpo del mensaje (body), " +
        "y opcionalmente CC y BCC. El borrador queda guardado en la carpeta Drafts de Gmail " +
        "y puede ser editado o enviado posteriormente.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Direccion de correo del destinatario principal (ej: 'usuario@gmail.com').",
          },
          subject: {
            type: "string",
            description: "Asunto del correo.",
          },
          body: {
            type: "string",
            description: "Cuerpo del mensaje en texto plano.",
          },
          cc: {
            type: "string",
            description: "Destinatarios en copia (CC), separados por comas. Opcional.",
          },
          bcc: {
            type: "string",
            description: "Destinatarios en copia oculta (BCC), separados por comas. Opcional.",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_calendar_event",
      description:
        "Crea un nuevo evento en el Google Calendar principal del usuario autenticado. " +
        "Permite especificar titulo, fecha/hora de inicio y fin, zona horaria, descripcion, " +
        "ubicacion y lista de asistentes. Las fechas deben estar en formato ISO 8601.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Titulo del evento (ej: 'Reunion de planificacion').",
          },
          start: {
            type: "string",
            description:
              "Fecha y hora de inicio en formato ISO 8601 (ej: '2024-06-15T10:00:00-06:00').",
          },
          end: {
            type: "string",
            description:
              "Fecha y hora de fin en formato ISO 8601 (ej: '2024-06-15T11:00:00-06:00').",
          },
          timeZone: {
            type: "string",
            description:
              "Zona horaria IANA (ej: 'America/Mexico_City', 'America/Chicago'). Por defecto: UTC.",
          },
          description: {
            type: "string",
            description: "Descripcion o notas del evento. Opcional.",
          },
          location: {
            type: "string",
            description: "Ubicacion fisica o enlace de videollamada. Opcional.",
          },
          attendees: {
            type: "array",
            description: "Lista de correos electronicos de los asistentes. Opcional.",
            items: { type: "string" },
          },
        },
        required: ["title", "start", "end"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_calendar_event",
      description:
        "Modifica un evento existente en el Google Calendar principal del usuario autenticado. " +
        "Permite cambiar titulo, fechas, descripcion, ubicacion o cualquier otro campo. " +
        "Requiere el ID del evento a modificar. Solo se actualizaran los campos proporcionados; " +
        "los demas permaneceran sin cambios.",
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "ID del evento de Calendar a modificar.",
          },
          title: {
            type: "string",
            description: "Nuevo titulo del evento. Opcional.",
          },
          start: {
            type: "string",
            description: "Nueva fecha/hora de inicio en formato ISO 8601. Opcional.",
          },
          end: {
            type: "string",
            description: "Nueva fecha/hora de fin en formato ISO 8601. Opcional.",
          },
          timeZone: {
            type: "string",
            description: "Nueva zona horaria IANA. Opcional.",
          },
          description: {
            type: "string",
            description: "Nueva descripcion del evento. Opcional.",
          },
          location: {
            type: "string",
            description: "Nueva ubicacion del evento. Opcional.",
          },
        },
        required: ["eventId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "gmail_request_send_email",
      description:
        "Redacta un correo electronico para enviarlo inmediatamente desde la cuenta de Gmail del usuario autenticado. " +
        "IMPORTANTE: Esta herramienta requiere confirmacion explicita del usuario antes de realizar el envio real. " +
        "El usuario vera una tarjeta con los detalles del correo y debera aprobarlo o rechazarlo manualmente. " +
        "Usa esta herramienta siempre que el usuario pida enviar un correo.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Direccion de correo del destinatario principal.",
          },
          subject: {
            type: "string",
            description: "Asunto del correo.",
          },
          body: {
            type: "string",
            description: "Cuerpo del mensaje en texto plano. Puede incluir saltos de linea.",
          },
        },
        required: ["to", "subject", "body"],
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

function extractPlainTextBody(
  payload: { body?: { data?: string | null }; parts?: Array<{ mimeType?: string | null; body?: { data?: string | null }; parts?: Array<{ mimeType?: string | null; body?: { data?: string | null }; parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } }> }>; filename?: string | null }> } | undefined
): string {
  if (!payload) return "";

  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, "base64url").toString("utf-8").trim();
    } catch {
      return "";
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain") {
        const text = extractPlainTextBody(part);
        if (text) return text;
      }
    }
    for (const part of payload.parts) {
      if (!part.mimeType?.startsWith("multipart/")) {
        const text = extractPlainTextBody(part);
        if (text) return text;
      }
    }
  }

  return "";
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
        format: "full",
      });

      const headers = detail.data.payload?.headers ?? [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value ?? "(sin asunto)";
      const from =
        headers.find((h) => h.name === "From")?.value ?? "(desconocido)";
      const date =
        headers.find((h) => h.name === "Date")?.value ?? "";

      const body = extractPlainTextBody(detail.data.payload);

      return {
        id: msg.id,
        threadId: detail.data.threadId,
        subject,
        from,
        date,
        snippet: detail.data.snippet ?? "",
        body: body || "(cuerpo no disponible en texto plano)",
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

function buildRfc2822Message(args: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}): string {
  const headers: string[] = [];
  headers.push(`To: ${args.to}`);
  if (args.cc) headers.push(`Cc: ${args.cc}`);
  if (args.bcc) headers.push(`Bcc: ${args.bcc}`);
  headers.push(`Subject: ${args.subject}`);
  headers.push("Content-Type: text/plain; charset=UTF-8");
  headers.push("MIME-Version: 1.0");
  headers.push("");
  headers.push(args.body);
  return headers.join("\r\n");
}

async function executeGmailCreateDraft(
  accessToken: string,
  args: { to: string; subject: string; body: string; cc?: string; bcc?: string }
) {
  const auth = buildOAuthClient(accessToken);
  const gmail = google.gmail({ version: "v1", auth });

  const rfc2822 = buildRfc2822Message(args);
  const encoded = Buffer.from(rfc2822).toString("base64url");

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: encoded },
    },
  });

  return {
    draftId: res.data.id,
    message: "Borrador creado exitosamente en la carpeta Drafts de Gmail.",
  };
}

async function executeCreateCalendarEvent(
  accessToken: string,
  args: {
    title: string;
    start: string;
    end: string;
    timeZone?: string;
    description?: string;
    location?: string;
    attendees?: string[];
  }
) {
  const auth = buildOAuthClient(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  const timeZone = args.timeZone ?? "UTC";

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: args.title,
      description: args.description,
      start: { dateTime: args.start, timeZone },
      end: { dateTime: args.end, timeZone },
      location: args.location,
      attendees: args.attendees?.map((email) => ({ email })),
    },
  });

  return {
    eventId: res.data.id,
    htmlLink: res.data.htmlLink,
    title: res.data.summary,
    start: res.data.start?.dateTime ?? res.data.start?.date,
    end: res.data.end?.dateTime ?? res.data.end?.date,
    message: "Evento creado exitosamente en Google Calendar.",
  };
}

async function executeMoveCalendarEvent(
  accessToken: string,
  args: {
    eventId: string;
    title?: string;
    start?: string;
    end?: string;
    timeZone?: string;
    description?: string;
    location?: string;
  }
) {
  const auth = buildOAuthClient(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  const timeZone = args.timeZone ?? "UTC";
  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) patch.summary = args.title;
  if (args.description !== undefined) patch.description = args.description;
  if (args.location !== undefined) patch.location = args.location;
  if (args.start !== undefined) patch.start = { dateTime: args.start, timeZone };
  if (args.end !== undefined) patch.end = { dateTime: args.end, timeZone };

  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId: args.eventId,
    requestBody: patch,
  });

  return {
    eventId: res.data.id,
    htmlLink: res.data.htmlLink,
    title: res.data.summary,
    start: res.data.start?.dateTime ?? res.data.start?.date,
    end: res.data.end?.dateTime ?? res.data.end?.date,
    message: "Evento modificado exitosamente en Google Calendar.",
  };
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

    case "gmail_create_draft":
      return executeGmailCreateDraft(accessToken, {
        to: typeof args.to === "string" ? args.to : "",
        subject: typeof args.subject === "string" ? args.subject : "",
        body: typeof args.body === "string" ? args.body : "",
        cc: typeof args.cc === "string" ? args.cc : undefined,
        bcc: typeof args.bcc === "string" ? args.bcc : undefined,
      });

    case "create_calendar_event":
      return executeCreateCalendarEvent(accessToken, {
        title: typeof args.title === "string" ? args.title : "",
        start: typeof args.start === "string" ? args.start : "",
        end: typeof args.end === "string" ? args.end : "",
        timeZone: typeof args.timeZone === "string" ? args.timeZone : undefined,
        description:
          typeof args.description === "string" ? args.description : undefined,
        location:
          typeof args.location === "string" ? args.location : undefined,
        attendees: Array.isArray(args.attendees)
          ? args.attendees.filter(
              (a): a is string => typeof a === "string"
            )
          : undefined,
      });

    case "move_calendar_event":
      return executeMoveCalendarEvent(accessToken, {
        eventId: typeof args.eventId === "string" ? args.eventId : "",
        title: typeof args.title === "string" ? args.title : undefined,
        start: typeof args.start === "string" ? args.start : undefined,
        end: typeof args.end === "string" ? args.end : undefined,
        timeZone: typeof args.timeZone === "string" ? args.timeZone : undefined,
        description:
          typeof args.description === "string" ? args.description : undefined,
        location:
          typeof args.location === "string" ? args.location : undefined,
      });

    case "gmail_request_send_email":
      throw new Error(
        "gmail_request_send_email must be intercepted in the tool-calling loop. " +
          "It should never reach executeToolCall directly."
      );

    default:
      throw new Error(`Unknown tool function: ${functionName}`);
  }
}
