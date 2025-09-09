import { StravaWebhookEvent } from "@/server/strava";
import { NextRequest } from "next/server";

// TODO: Implement Strava webhooks
// POST to create sub endpoint
// https://developers.strava.com/docs/webhooks/

export async function GET(req: NextRequest) {
  const requestBody = await req.json();
  console.log("Received Strava webhook validation:", requestBody);
  const url = new URL(req.url);
  const verifyToken = url.searchParams.get("hub.verify_token");
  const hubMode = url.searchParams.get("hub.mode");
  const hubChallenge = url.searchParams.get("hub.challenge");

  if (
    verifyToken === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN &&
    hubMode === "subscribe" &&
    hubChallenge
  ) {
    return new Response(hubChallenge, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const requestBody = (await req.json()) as StravaWebhookEvent;
  console.log("Received Strava webhook:", requestBody);
}
