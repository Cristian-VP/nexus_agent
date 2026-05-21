import crypto from "node:crypto";
import type { Request } from "express";
import { config } from "./config";
import {
  createAuditLog,
  getGoogleTokens,
  getGoogleUserById,
  saveGoogleTokens,
  upsertGoogleUser,
  updateGoogleAccessToken
} from "./db";
import { redis } from "./redis";

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly"
];

export interface AuthenticatedPrincipal {
  id: string;
  googleSub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export function buildPkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function buildGoogleAuthorizationUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", config.googleClientId);
  authorizationUrl.searchParams.set("redirect_uri", config.googleRedirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", googleScopes.join(" "));
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("state", params.state);
  authorizationUrl.searchParams.set("code_challenge", params.codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return authorizationUrl.toString();
}

export async function createOAuthStateRecord(): Promise<{
  state: string;
  codeVerifier: string;
  authorizationUrl: string;
}> {
  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = buildPkceChallenge(codeVerifier);
  const authorizationUrl = buildGoogleAuthorizationUrl({ state, codeChallenge });

  await redis.set(
    `oauth:state:${state}`,
    JSON.stringify({ codeVerifier, createdAt: new Date().toISOString() }),
    { EX: config.oauthStateTtlSeconds }
  );

  return { state, codeVerifier, authorizationUrl };
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  expiresIn: number;
  tokenType: string;
  scope: string[];
}> {
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.googleRedirectUri
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  };

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Google token exchange did not return the expected refresh token");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    idToken: payload.id_token ?? null,
    expiresIn: payload.expires_in,
    tokenType: payload.token_type ?? "Bearer",
    scope: payload.scope ? payload.scope.split(" ") : []
  };
}

async function fetchGoogleProfile(accessToken: string): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google userinfo failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };
}

export async function completeOAuthLogin(code: string, state: string): Promise<AuthenticatedPrincipal> {
  const statePayload = await redis.get(`oauth:state:${state}`);
  if (!statePayload) {
    throw new Error("OAuth state is missing or expired");
  }

  await redis.del(`oauth:state:${state}`);
  const parsed = JSON.parse(statePayload) as { codeVerifier: string };
  const tokenSet = await exchangeCodeForTokens(code, parsed.codeVerifier);
  const profile = await fetchGoogleProfile(tokenSet.accessToken);
  const user = await upsertGoogleUser(profile);

  await saveGoogleTokens(user.id, {
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    idToken: tokenSet.idToken,
    scopes: tokenSet.scope.length > 0 ? tokenSet.scope : googleScopes,
    tokenType: tokenSet.tokenType,
    expiresAt: new Date(Date.now() + tokenSet.expiresIn * 1000)
  });

  return user;
}

export function readAuthenticatedUser(req: Request): AuthenticatedPrincipal | null {
  const principal = req.session?.principal as AuthenticatedPrincipal | undefined;
  return principal ?? null;
}

export async function ensureFreshGoogleTokens(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
}> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) {
    throw new Error("No Google tokens are stored for the current session");
  }

  const expiresSoon =
    tokens.expiresAt.getTime() - Date.now() <= config.refreshLeewaySeconds * 1000;

  if (!expiresSoon) {
    return tokens;
  }

  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    await createAuditLog(userId, "google_auth", {}, "FAILED", errorText);
    throw new Error(`Google token refresh failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
    id_token?: string;
    refresh_token?: string;
  };

  await updateGoogleAccessToken(userId, {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? tokens.refreshToken,
    idToken: payload.id_token ?? tokens.idToken,
    expiresAt: new Date(Date.now() + payload.expires_in * 1000)
  });

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? tokens.refreshToken,
    idToken: payload.id_token ?? tokens.idToken
  };
}

export async function loadPrincipalFromSession(req: Request): Promise<AuthenticatedPrincipal | null> {
  const principal = req.session.principal ?? readAuthenticatedUser(req);
  if (!principal) {
    return null;
  }

  const freshUser = await getGoogleUserById(principal.id);
  if (!freshUser) {
    return null;
  }

  return freshUser;
}