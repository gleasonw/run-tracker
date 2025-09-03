import { Session } from "@/server/schema";
import { cookies } from "next/headers";
import { cache } from "react";

//TODO: https://lucia-auth.com/sessions/basic

function generateSecureRandomString(): string {
  // Human readable alphabet (a-z, 0-9 without l, o, 0, 1 to avoid confusion)
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";

  // Generate 24 bytes = 192 bits of entropy.
  // We're only going to use 5 bits per byte so the total entropy will be 192 * 5 / 8 = 120 bits
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  let id = "";
  for (let i = 0; i < bytes.length; i++) {
    // >> 3 "removes" the right-most 3 bits of the byte
    id += alphabet[bytes[i] >> 3];
  }
  return id;
}

async function hashSecret(secret: string): Promise<Uint8Array> {
  const secretBytes = new TextEncoder().encode(secret);
  const secretHashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
  return new Uint8Array(secretHashBuffer);
}

async function createSession(db): Promise<SessionWithToken> {
  const now = new Date();

  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  const secretHash = await hashSecret(secret);

  const token = id + "." + secret;

  const session: SessionWithToken = {
    id,
    secretHash,
    createdAt: now,
    token,
  };

  // await executeQuery(
  //   dbPool,
  //   "INSERT INTO session (id, secret_hash, created_at) VALUES (?, ?, ?)",
  //   [
  //     session.id,
  //     session.secretHash,
  //     Math.floor(session.createdAt.getTime() / 1000),
  //   ]
  // );

  return session;
}

export const getCurrentSession = cache(async (): Promise<Session> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value ?? null;
  if (token === null) {
    return { session: null, user: null };
  }
  const result = await validateSessionToken(token);
  return result;
});

// TODO: add special branded type for session token
async function validateSessionToken(
  dbPool: DBPool,
  token: string
): Promise<Session | null> {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) {
    return null;
  }
  const sessionId = tokenParts[0];
  const sessionSecret = tokenParts[1];

  const session = await getSession(dbPool, sessionId);
  if (!session) {
    return null;
  }

  const tokenSecretHash = await hashSecret(sessionSecret);
  const validSecret = constantTimeEqual(tokenSecretHash, session.secretHash);
  if (!validSecret) {
    return null;
  }

  return session;
}

async function getSession(
  dbPool: DBPool,
  sessionId: string
): Promise<Session | null> {
  const now = new Date();

  // const result = await executeQuery(
  //   dbPool,
  //   "SELECT id, secret_hash, created_at FROM session WHERE id = ?",
  //   [sessionId]
  // );
  if (result.rows.length !== 1) {
    return null;
  }
  const row = result.rows[0];
  const session: Session = {
    id: row[0],
    secretHash: row[1],
    createdAt: new Date(row[2] * 1000),
  };

  // Check expiration
  if (
    now.getTime() - session.createdAt.getTime() >=
    sessionExpiresInSeconds * 1000
  ) {
    await deleteSession(sessionId);
    return null;
  }

  return session;
}

async function deleteSession(dbPool: DBPool, sessionId: string): Promise<void> {
  // await executeQuery(dbPool, "DELETE FROM session WHERE id = ?", [sessionId]);
}
