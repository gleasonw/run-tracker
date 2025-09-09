import { db } from "@/server/db";
import { oauthAccounts, userTable } from "@/server/schema";
import {
  strava,
  STRAVA_OAUTH_COOKIE_KEY,
  StravaAuthResponse,
} from "@/server/strava";
import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import * as sessions from "@/server/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STRAVA_OAUTH_COOKIE_KEY)?.value;
  if (code === null || state === null || storedState === undefined) {
    return new Response("Missing code or state", { status: 400 });
  }
  if (state !== storedState) {
    return new Response("Invalid state", { status: 400 });
  }
  let token;
  try {
    token = await strava.validateAuthorizationCode(code);
  } catch (e) {
    console.error("Error validating authorization code", e);
    return new Response("Error validating authorization code", { status: 500 });
  }

  const stravaOauth = token.data as StravaAuthResponse;
  const maybeExistingUser = await db
    .select()
    .from(userTable)
    .innerJoin(oauthAccounts, eq(oauthAccounts.userId, userTable.id))
    .where(
      and(
        eq(oauthAccounts.provider, "strava"),
        eq(oauthAccounts.providerAccountId, stravaOauth.athlete.id.toString())
      )
    );
  const existingUser = maybeExistingUser[0]?.users ?? null;
  if (existingUser !== null) {
    await sessions.createSession(existingUser);
    console.log("creating session for existing user");
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
      },
    });
  }

  //TODO: actually encrypt the tokens
  const newUser = await db.transaction(async (tx) => {
    const [user] = await tx.insert(userTable).values({}).returning();
    if (!user) {
      throw new Error("Failed to create user");
    }
    await tx.insert(oauthAccounts).values({
      userId: user.id,
      provider: "strava",
      providerAccountId: stravaOauth.athlete.id.toString(),
      scope: "read,activity:read_all",
      refreshTokenEnc: stravaOauth.refresh_token,
      accessTokenEnc: stravaOauth.access_token,
      accessTokenExpiresAt: new Date(stravaOauth.expires_at * 1000),
      extra: {
        athlete: stravaOauth.athlete,
        token_type: stravaOauth.token_type,
        expires_in: stravaOauth.expires_in,
      },
    });
    return user;
  });

  await sessions.createSession(newUser);

  //TODO: we should probably fetch the first batch of activities for this user

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
    },
  });
}
