import { db } from "@/server/db";
import { Session, sessionTable, User, userTable } from "@/server/schema";
import { eq, gt, and, sql } from "drizzle-orm";
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

const sessionValidTime = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SessionWithToken = Session & { token: string };

export async function createSession(user: User): Promise<SessionWithToken> {
  const now = new Date();
  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  const secretHash = await hashSecret(secret);

  const token = `${id}.${secret}`;

  const session = await db
    .insert(sessionTable)
    .values({
      id,
      userId: user.id,
      expiresAt: new Date(now.getTime() + sessionValidTime),
      secret_hash: secretHash,
    })
    .returning();
  const newSession = session.at(0);
  if (!newSession) {
    throw new Error("Failed to create session");
  }
  return { ...newSession, token };
}

export const getCurrentSession = cache(
  async (): Promise<{ session: Session | null; user: User | null }> => {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value ?? null;
    if (token === null) {
      return { session: null, user: null };
    }
    const tokenParts = token.split(".");
    if (tokenParts.length !== 2) {
      return { session: null, user: null };
    }
    const [sessionId, secret] = tokenParts;

    const maybeResult = await db
      .select()
      .from(sessionTable)
      .where(
        and(
          eq(sessionTable.id, sessionId),
          gt(sessionTable.expiresAt, sql`CURRENT_TIMESTAMP`)
        )
      );
    const result = maybeResult.at(0);
    if (result === undefined) {
      return { session: null, user: null };
    }

    const secretHash = await hashSecret(secret);
    if (!constantTimeEqual(result.secret_hash, secretHash)) {
      return { session: null, user: null };
    }
    const maybeUser = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, result.userId));
    const user = maybeUser[0] ?? null;
    if (!user) {
      return { session: null, user: null };
    }
    // Extend session if it's going to expire in less than half the valid time
    const now = new Date();
    if (result.expiresAt.getTime() - now.getTime() < sessionValidTime / 2) {
      const newExpiresAt = new Date(now.getTime() + sessionValidTime);
      await db
        .update(sessionTable)
        .set({ expiresAt: newExpiresAt })
        .where(eq(sessionTable.id, result.id));
      result.expiresAt = newExpiresAt;
    }
    return { session: result, user };
  }
);

async function hashSecret(secret: string): Promise<Uint8Array<ArrayBuffer>> {
  const secretBytes = new TextEncoder().encode(secret);
  const secretHashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
  return new Uint8Array(secretHashBuffer);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let c = 0;
  for (let i = 0; i < a.byteLength; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}
