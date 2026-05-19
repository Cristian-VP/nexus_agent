import type { NextRequest } from "next/server";

import { getBackendBridgeUrl } from "../../../../../lib/backend";

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

export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await fetch(`${getBackendBridgeUrl()}/api/auth/google/callback${request.nextUrl.search}`, {
    headers: {
      cookie: request.headers.get("cookie") ?? ""
    },
    redirect: "manual",
    cache: "no-store"
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: copyHeaders(upstream.headers)
  });
}