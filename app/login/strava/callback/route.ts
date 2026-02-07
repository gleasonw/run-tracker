import { db } from "@/server/db";
import { oauthAccounts, stravaActivities } from "@/server/schema";
import {
  strava,
  STRAVA_OAUTH_COOKIE_KEY,
  StravaAuthResponse,
} from "@/server/strava";
import { cookies } from "next/headers";
import { eq, and, ne } from "drizzle-orm";
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
  cookieStore.delete(STRAVA_OAUTH_COOKIE_KEY);

  let token;
  try {
    token = await strava.validateAuthorizationCode(code);
  } catch (e) {
    console.error("Error validating authorization code", e);
    return new Response("Error validating authorization code", { status: 500 });
  }

  const stravaOauth = token.data as StravaAuthResponse;
  const currentSession = await sessions.getCurrentSession();
  const currentUser = currentSession.user?.user ?? null;
  if (currentUser === null) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/link",
      },
    });
  }

  const maybeExistingAccount = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, "strava"),
        eq(oauthAccounts.providerAccountId, stravaOauth.athlete.id.toString())
      )
    );
  const existingStravaRow = maybeExistingAccount[0] ?? null;

  const providerData = {
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
    active: true,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    // Keep a single active Strava link per app user.
    await tx
      .update(oauthAccounts)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(oauthAccounts.userId, currentUser.id),
          eq(oauthAccounts.provider, "strava"),
          existingStravaRow ? ne(oauthAccounts.id, existingStravaRow.id) : undefined
        )
      );

    if (existingStravaRow) {
      const previousOwnerId = existingStravaRow.userId;

      // Reclaim ownership: move this Strava account link to the current user.
      await tx
        .update(oauthAccounts)
        .set({
          userId: currentUser.id,
          ...providerData,
        })
        .where(eq(oauthAccounts.id, existingStravaRow.id));

      // Move historical activities for this athlete to the current user as well.
      if (previousOwnerId !== currentUser.id) {
        await tx
          .update(stravaActivities)
          .set({ userId: currentUser.id })
          .where(
            and(
              eq(stravaActivities.userId, previousOwnerId),
              eq(stravaActivities.athleteId, stravaOauth.athlete.id)
            )
          );
      }
    } else {
      await tx.insert(oauthAccounts).values({
        userId: currentUser.id,
        provider: "strava",
        ...providerData,
      });
    }
  });

  //TODO: we should probably fetch the first batch of activities for this user

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
    },
  });
}
