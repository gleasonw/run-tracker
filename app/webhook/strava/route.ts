import { StravaWebhookEvent } from "@/server/strava";
import { NextRequest } from "next/server";

// TODO: Implement Strava webhooks
// POST to create sub endpoint
// https://developers.strava.com/docs/webhooks/

export async function POST(req: NextRequest) {
  const requestBody = (await req.json()) as StravaWebhookEvent;
  console.log("Received Strava webhook:", requestBody);
}
