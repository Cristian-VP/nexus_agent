import { Pool } from "pg";
import { config } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";

export interface GoogleUserRecord {
  id: string;
  googleSub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface GoogleTokenRecord {
  googleUserId: string;
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  scopes: string[];
  tokenType: string;
  expiresAt: Date;
  lastRefreshedAt: Date;
}

export interface WorkspaceSnapshot {
  gmailThreads: Array<{
    id: string;
    subject: string;
    sender: string;
    preview: string;
    updatedAt: string;
    unread: boolean;
  }>;
  calendarEvents: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    location?: string;
  }>;
  updatedAt: string;
}

export const pool = new Pool({ connectionString: config.databaseUrl });

type GoogleProfile = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export async function upsertGoogleUser(profile: GoogleProfile): Promise<GoogleUserRecord> {
  const result = await pool.query<GoogleUserRecord>(
    `
      INSERT INTO google_users (id, google_sub, email, name, picture, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (google_sub)
      DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        picture = EXCLUDED.picture,
        updated_at = NOW()
      RETURNING id, google_sub AS "googleSub", email, name, picture
    `,
    [profile.sub, profile.email, profile.name ?? null, profile.picture ?? null]
  );

  return result.rows[0];
}

export async function getGoogleUserById(userId: string): Promise<GoogleUserRecord | null> {
  const result = await pool.query<GoogleUserRecord>(
    `
      SELECT id, google_sub AS "googleSub", email, name, picture
      FROM google_users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function saveGoogleTokens(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    idToken?: string | null;
    scopes: string[];
    tokenType?: string;
    expiresAt: Date;
  }
): Promise<void> {
  const encryptedAccessToken = encryptSecret(tokens.accessToken, config.tokenEncryptionKey);
  const encryptedRefreshToken = encryptSecret(tokens.refreshToken, config.tokenEncryptionKey);
  const encryptedIdToken = tokens.idToken
    ? encryptSecret(tokens.idToken, config.tokenEncryptionKey)
    : null;

  await pool.query(
    `
      INSERT INTO google_tokens (
        google_user_id,
        access_token_encrypted,
        refresh_token_encrypted,
        id_token_encrypted,
        scopes,
        token_type,
        expires_at,
        last_refreshed_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
      ON CONFLICT (google_user_id)
      DO UPDATE SET
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        id_token_encrypted = EXCLUDED.id_token_encrypted,
        scopes = EXCLUDED.scopes,
        token_type = EXCLUDED.token_type,
        expires_at = EXCLUDED.expires_at,
        last_refreshed_at = NOW(),
        updated_at = NOW()
    `,
    [
      userId,
      encryptedAccessToken,
      encryptedRefreshToken,
      encryptedIdToken,
      tokens.scopes.join(" "),
      tokens.tokenType ?? "Bearer",
      tokens.expiresAt
    ]
  );
}

export async function getGoogleTokens(userId: string): Promise<GoogleTokenRecord | null> {
  const result = await pool.query(
    `
      SELECT
        google_user_id AS "googleUserId",
        access_token_encrypted,
        refresh_token_encrypted,
        id_token_encrypted,
        scopes,
        token_type AS "tokenType",
        expires_at AS "expiresAt",
        last_refreshed_at AS "lastRefreshedAt"
      FROM google_tokens
      WHERE google_user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0] as
    | {
        googleUserId: string;
        access_token_encrypted: string;
        refresh_token_encrypted: string;
        id_token_encrypted: string | null;
        scopes: string;
        tokenType: string;
        expiresAt: Date;
        lastRefreshedAt: Date;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    googleUserId: row.googleUserId,
    accessToken: decryptSecret(row.access_token_encrypted, config.tokenEncryptionKey),
    refreshToken: decryptSecret(row.refresh_token_encrypted, config.tokenEncryptionKey),
    idToken: row.id_token_encrypted
      ? decryptSecret(row.id_token_encrypted, config.tokenEncryptionKey)
      : null,
    scopes: row.scopes ? row.scopes.split(" ") : [],
    tokenType: row.tokenType,
    expiresAt: new Date(row.expiresAt),
    lastRefreshedAt: new Date(row.lastRefreshedAt)
  };
}

export async function updateGoogleAccessToken(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    idToken?: string | null;
    expiresAt: Date;
  }
): Promise<void> {
  const existing = await getGoogleTokens(userId);
  if (!existing) {
    throw new Error("Cannot refresh tokens for an unknown Google user");
  }

  await saveGoogleTokens(userId, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken ?? existing.idToken,
    scopes: existing.scopes,
    tokenType: existing.tokenType,
    expiresAt: tokens.expiresAt
  });
}

export async function getWorkspaceSnapshot(
  userId: string
): Promise<WorkspaceSnapshot | null> {
  const result = await pool.query(
    `
      SELECT snapshot, updated_at AS "updatedAt"
      FROM workspace_snapshots
      WHERE google_user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0] as { snapshot: WorkspaceSnapshot; updatedAt: Date } | undefined;
  if (!row) {
    return null;
  }

  return {
    ...row.snapshot,
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

export async function saveWorkspaceSnapshot(
  userId: string,
  snapshot: WorkspaceSnapshot
): Promise<void> {
  await pool.query(
    `
      INSERT INTO workspace_snapshots (google_user_id, snapshot, created_at, updated_at)
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (google_user_id)
      DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
    `,
    [userId, JSON.stringify(snapshot)]
  );
}