import { getCurrentSession, RunTrackerUser } from "@/server/session";
import * as arctic from "arctic";

if (
  process.env.STRAVA_CLIENT_ID === undefined ||
  process.env.STRAVA_CLIENT_SECRET === undefined ||
  process.env.STRAVA_REDIRECT_URI === undefined
) {
  throw new Error("Missing Strava configuration");
}

export const STRAVA_OAUTH_COOKIE_KEY = "strava_oauth_state";

export const strava = new arctic.Strava(
  process.env.STRAVA_CLIENT_ID,
  process.env.STRAVA_CLIENT_SECRET,
  process.env.STRAVA_REDIRECT_URI
);

export type StravaAuthResponse = {
  token_type: "Bearer";
  expires_at: number; // epoch seconds
  expires_in: number; // seconds until expiration
  refresh_token: string;
  access_token: string;
  athlete: StravaAthlete;
};

export type StravaAthlete = {
  id: number;
  username: string | null;
  resource_state: number;
  firstname: string;
  lastname: string;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sex: "M" | "F" | null;
  premium: boolean;
  summit: boolean;
  created_at: string; // ISO date-time
  updated_at: string; // ISO date-time
  badge_type_id: number;
  weight: number | null;
  profile_medium: string;
  profile: string;
  friend: string | null;
  follower: string | null;
};

async function appendAuth(user: RunTrackerUser, req: Request) {
  req.headers.set("Authorization", `Bearer ${user.strava.access_token}`);
  return req;
}

export async function getActivities() {
  const { session, user } = await getCurrentSession();
  if (!user) {
    throw new Error("Not logged in");
  }
  await checkRefresh(user);
  // const res = await fetch("https://www.strava.com/api/v3/athlete/activities", {
  //   headers: {
  //     Authorization: `Bearer ${user.strava.access_token}`,
  //   },
  // });
  // if (!res.ok) {
  //   console.log(await res.text());
  //   throw new Error(`Error fetching activities: ${res.statusText}`);
  // }
  // return res.json();
}

async function checkRefresh(user: RunTrackerUser) {
  const now = Math.floor(Date.now() / 1000);
  if (user.strava.expires_at < now + 60) {
    console.log("Refreshing Strava token");
    const newTokens = await fetch("https://www.strava.com/api/v3/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID!,
        client_secret: process.env.STRAVA_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: user.strava.refresh_token,
      }),
    });
    console.log(newTokens);
    // update tokens in database, return old user object with new tokens
  }
}
