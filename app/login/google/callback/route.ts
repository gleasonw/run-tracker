import { db } from "@/server/db";
import {
  getGoogleUserInfo,
  google,
  GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_KEY,
  GOOGLE_OAUTH_STATE_COOKIE_KEY,
} from "@/server/google";
import { oauthAccounts, userTable } from "@/server/schema";
import { getCurrentSession } from "@/server/session";
import * as sessions from "@/server/session";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE_KEY)?.value;
  const storedCodeVerifier = cookieStore.get(
    GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_KEY
  )?.value;

  if (
    code === null ||
    state === null ||
    storedState === undefined ||
    storedCodeVerifier === undefined
  ) {
    return new Response("Missing code or oauth cookies", { status: 400 });
  }
  if (state !== storedState) {
    return new Response("Invalid state", { status: 400 });
  }

  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE_KEY);
  cookieStore.delete(GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_KEY);

  let tokens;
  try {
    tokens = await google.validateAuthorizationCode(code, storedCodeVerifier);
  } catch (e) {
    console.error("Error validating Google authorization code", e);
    return new Response("Error validating Google authorization code", {
      status: 500,
    });
  }

  let googleUser: Awaited<ReturnType<typeof getGoogleUserInfo>>;
  try {
    googleUser = await getGoogleUserInfo(tokens.accessToken());
  } catch (e) {
    console.error("Error fetching Google user profile", e);
    return new Response("Error fetching Google user profile", { status: 500 });
  }

  const currentSession = await getCurrentSession();
  const currentUser = currentSession.user?.user ?? null;
  const maybeExistingGoogleAccount = await db
    .select()
    .from(userTable)
    .innerJoin(oauthAccounts, eq(oauthAccounts.userId, userTable.id))
    .where(
      and(
        eq(oauthAccounts.provider, "google"),
        eq(oauthAccounts.providerAccountId, googleUser.sub)
      )
    );
  const existingGoogleUser = maybeExistingGoogleAccount[0]?.users ?? null;

  if (
    currentUser !== null &&
    existingGoogleUser !== null &&
    existingGoogleUser.id !== currentUser.id
  ) {
    return new Response("Google account already linked to another user", {
      status: 409,
    });
  }

  const targetUser =
    currentUser ??
    existingGoogleUser ??
    (
      await db.insert(userTable).values({}).returning()
    )[0];
  if (!targetUser) {
    return new Response("Failed to resolve user", { status: 500 });
  }

  const existingGoogleForTarget = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.userId, targetUser.id),
        eq(oauthAccounts.provider, "google")
      )
    )
    .limit(1);
  const existingGoogleRow = existingGoogleForTarget[0] ?? null;
  const nextRefreshToken = tokens.hasRefreshToken()
    ? tokens.refreshToken()
    : (existingGoogleRow?.refreshTokenEnc ?? null);
  const nextScope = tokens.hasScopes()
    ? tokens.scopes().join(" ")
    : (existingGoogleRow?.scope ?? null);

  const providerData = {
    providerAccountId: googleUser.sub,
    scope: nextScope,
    accessTokenEnc: tokens.accessToken(),
    refreshTokenEnc: nextRefreshToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt(),
    extra: {
      email: googleUser.email ?? null,
      name: googleUser.name ?? null,
      given_name: googleUser.given_name ?? null,
      family_name: googleUser.family_name ?? null,
      picture: googleUser.picture ?? null,
      locale: googleUser.locale ?? null,
      email_verified: googleUser.email_verified ?? null,
    },
    active: true,
    updatedAt: new Date(),
  };

  if (existingGoogleRow) {
    await db
      .update(oauthAccounts)
      .set(providerData)
      .where(eq(oauthAccounts.id, existingGoogleRow.id));
  } else {
    await db.insert(oauthAccounts).values({
      userId: targetUser.id,
      provider: "google",
      ...providerData,
    });
  }

  if (currentUser === null) {
    await sessions.createSession(targetUser);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
    },
  });
}
