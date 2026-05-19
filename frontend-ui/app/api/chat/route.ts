import type { NextRequest } from "next/server";

import { getBackendBridgeUrl } from "../../../lib/backend";

function copyHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (["connection", "content-length", "transfer-encoding"].includes(lower)) {
      return;
    }

    headers.append(key, value);
  });

  return headers;
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.text();
  const upstream = await fetch(`${getBackendBridgeUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      cookie: request.headers.get("cookie") ?? ""
    },
    body,
    cache: "no-store"
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: copyHeaders(upstream.headers)
  });
}