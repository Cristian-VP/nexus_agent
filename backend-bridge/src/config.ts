import 'dotenv/config';

type EnvKey = keyof NodeJS.ProcessEnv;

function required(name: EnvKey): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function asBool(value: string | undefined, fallback = false): boolean {
  if (typeof value !== "string") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function asNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface Config {
  port: number;
  frontendUrl: string;
  backendUrl: string;
  opencodeBaseUrl: string;
  opencodeApiKey: string;
  openclawGatewayUrl: string;
  openclawGatewayToken?: string;
  databaseUrl: string;
  redisUrl: string;
  sessionSecret: string;
  tokenEncryptionKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  cookieSecure: boolean;
  oauthStateTtlSeconds: number;
  refreshLeewaySeconds: number;
}

export const config: Config = {
  port: asNumber(process.env.BACKEND_PORT, 4000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  backendUrl: process.env.BACKEND_URL ?? "http://backend-bridge:4000",
  opencodeBaseUrl: required("OPENCODE_BASE_URL"),
  opencodeApiKey: required("OPENCODE_API_KEY"),
  openclawGatewayUrl:
    process.env.OPENCLAW_GATEWAY_URL ?? "http://nexus-agent-gateway:18789",
  openclawGatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://nexus:nexus@postgres:5432/nexus",
  redisUrl: process.env.REDIS_URL ?? "redis://redis:6379",
  sessionSecret: required("SESSION_SECRET"),
  tokenEncryptionKey: required("TOKEN_ENCRYPTION_KEY"),
  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    "http://localhost:3000/api/auth/google/callback",
  cookieSecure: asBool(process.env.COOKIE_SECURE, false),
  oauthStateTtlSeconds: asNumber(process.env.OAUTH_STATE_TTL_SECONDS, 600),
  refreshLeewaySeconds: asNumber(process.env.GOOGLE_REFRESH_LEEWAY_SECONDS, 60)
};