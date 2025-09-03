import { strava } from "@/server/strava";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  // TODO: check cookies that we set at initial redirect?
  if (code === null || state === null) {
    return new Response("Missing code or state", { status: 400 });
  }
  let token;
  try {
    token = await strava.validateAuthorizationCode(code);
  } catch (e) {
    console.error("Error validating authorization code", e);
    return new Response("Error validating authorization code", { status: 500 });
  }

  // todo: create user, make session, session token, etc...
  console.log(token);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
    },
  });
}
