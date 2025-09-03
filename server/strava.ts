import * as arctic from "arctic";

if (
  process.env.STRAVA_CLIENT_ID === undefined ||
  process.env.STRAVA_CLIENT_SECRET === undefined ||
  process.env.STRAVA_REDIRECT_URI === undefined
) {
  throw new Error("Missing Strava configuration");
}

export const strava = new arctic.Strava(
  process.env.STRAVA_CLIENT_ID,
  process.env.STRAVA_CLIENT_SECRET,
  process.env.STRAVA_REDIRECT_URI
);

const state = arctic.generateState();
console.log({ arcticeState: state });
const scopes = ["read", "activity:read_all"];
export const stravaAuthUrl = strava.createAuthorizationURL(state, scopes);
