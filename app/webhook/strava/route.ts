import { db } from "@/server/db";
import { stravaActivities } from "@/server/schema";
import {
  getAccountByStravaAthleteId,
  getActivityFromStrava,
  StravaActivityApi,
  stravaApiToPersistedActivity,
  StravaWebhookEvent,
} from "@/server/strava";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";

// TODO: Implement Strava webhooks
// POST to create sub endpoint
// https://developers.strava.com/docs/webhooks/

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const verifyToken = url.searchParams.get("hub.verify_token");
  const hubMode = url.searchParams.get("hub.mode");
  const hubChallenge = url.searchParams.get("hub.challenge");

  if (
    verifyToken === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN &&
    hubMode === "subscribe" &&
    hubChallenge
  ) {
    return NextResponse.json(
      { "hub.challenge": hubChallenge },
      { status: 200 }
    );
  }

  if (verifyToken !== process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    console.error("Invalid verify token:", verifyToken);
  }
}

export async function POST(req: NextRequest) {
  const requestBody = (await req.json()) as StravaWebhookEvent;
  console.log("Received Strava webhook:", requestBody);

  if (!requestBody?.aspect_type || !requestBody?.object_type) {
    console.error(`Invalid payload:`, requestBody);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  void handleStravaEvent(requestBody).catch((err) => {
    console.error("Error handling Strava event:", err);
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

async function handleStravaEvent(event: StravaWebhookEvent) {
  if (event.object_type === "athlete") {
    // we don't really care about this
    console.error("Ignoring athlete event: ", JSON.stringify(event));
    return;
  }
  const owner = await getAccountByStravaAthleteId(event.owner_id.toString());
  if (!owner) {
    console.error("No local user for athlete id: ", event.owner_id);
    return;
  }
  console.log("Owner: ", owner);
  switch (event.aspect_type) {
    case "update":
    case "create": {
      const activityData = await getActivityFromStrava({
        user: owner,
        activityId: event.object_id.toString(),
      });
      if (activityData === "error fetching activity") {
        console.error("Error fetching activity from Strava: ", event.object_id);
        return;
      }
      const toAppActivity = stravaApiToPersistedActivity(
        activityData,
        owner.user.id
      );
      await db
        .insert(stravaActivities)
        .values(toAppActivity)
        .onConflictDoUpdate({
          target: stravaActivities.stravaActivityId,
          set: toAppActivity,
          where: or(
            isNull(stravaActivities.updatedAt),
            toAppActivity.updatedAt
              ? lt(stravaActivities.updatedAt, toAppActivity.updatedAt)
              : undefined
          ),
        });
      break;
    }
    case "delete": {
      await db
        .delete(stravaActivities)
        .where(
          and(
            eq(stravaActivities.stravaActivityId, event.object_id),
            eq(stravaActivities.userId, owner.user.id)
          )
        );
      break;
    }
    default: {
      const _: never = event.aspect_type;
      throw new Error(`Unhandled aspect_type: ${event.aspect_type}`);
    }
  }
}
