import { strava, STRAVA_OAUTH_COOKIE_KEY } from "@/server/strava";
import { generateState } from "arctic";
import { cookies } from "next/headers";

export async function GET(): Promise<Response> {
  const state = generateState();
  const scopes = ["read", "activity:read_all"];

  const url = strava.createAuthorizationURL(state, scopes);

  const cookieStore = await cookies();
  cookieStore.set(STRAVA_OAUTH_COOKIE_KEY, state, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
    sameSite: "lax",
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
    },
  });
}
