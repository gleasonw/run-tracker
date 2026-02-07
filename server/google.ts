import * as arctic from "arctic";

if (
  process.env.GOOGLE_CLIENT_ID === undefined ||
  process.env.GOOGLE_CLIENT_SECRET === undefined ||
  process.env.GOOGLE_REDIRECT_URI === undefined
) {
  throw new Error("Missing Google configuration");
}

export const GOOGLE_OAUTH_STATE_COOKIE_KEY = "google_oauth_state";
export const GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_KEY =
  "google_oauth_code_verifier";

export const google = new arctic.Google(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
};

export async function getGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Google user info: ${response.statusText}`);
  }

  const profile = (await response.json()) as GoogleUserInfo;
  if (!profile.sub) {
    throw new Error("Google user info missing subject");
  }
  return profile;
}
