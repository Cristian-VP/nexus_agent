import { NextResponse } from "next/server";

import { getBackendBridgeUrl } from "../../../../../lib/backend";

export async function GET(): Promise<Response> {
  const upstream = await fetch(`${getBackendBridgeUrl()}/api/auth/google/start?format=json`, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!upstream.ok) {
    const message = await upstream.text();
    return NextResponse.json({ error: "oauth_start_failed", message }, { status: 502 });
  }

  const payload = (await upstream.json()) as { authorizationUrl: string };
  return NextResponse.redirect(payload.authorizationUrl, 302);
}