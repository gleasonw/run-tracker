import { db } from "@/server/db";
import {
  oauthAccounts,
  RunTrackerActivity,
  stravaActivities,
  userTable,
} from "@/server/schema";
import { getCurrentSession, RunTrackerUser } from "@/server/session";
import * as arctic from "arctic";
import { eq, gte, and, sql, lt, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";

if (
  process.env.STRAVA_CLIENT_ID === undefined ||
  process.env.STRAVA_CLIENT_SECRET === undefined ||
  process.env.STRAVA_REDIRECT_URI === undefined
) {
  throw new Error("Missing Strava configuration");
}

export type StravaWebhookEvent = {
  aspect_type: "create" | "update" | "delete";
  event_time: number; // epoch seconds
  object_id: number; // id of the object (e.g. activity id)
  object_type: "activity" | "athlete";
  owner_id: number; // athlete id
  subscription_id: number;
};

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

export async function getAccountByStravaAthleteId(
  stravaId: string
): Promise<RunTrackerUser | null> {
  const resp = await db
    .select()
    .from(oauthAccounts)
    .innerJoin(userTable, eq(oauthAccounts.userId, userTable.id))
    .where(eq(oauthAccounts.providerAccountId, stravaId));
  const user = resp[0]?.users ?? null;
  const oauth = resp[0]?.oauth_accounts ?? null;

  const extraObject = resp[0]?.oauth_accounts.extra;
  const stravaAthlete =
    extraObject && typeof extraObject === "object" && "athlete" in extraObject
      ? (extraObject.athlete as StravaAthlete)
      : null;

  if (!stravaAthlete) {
    throw new Error("Strava athlete data not found");
  }

  if (user && oauth) {
    return {
      user,
      strava: {
        athlete: stravaAthlete,
        refresh_token: oauth.refreshTokenEnc as string,
        access_token: oauth.accessTokenEnc as string,
        expires_at: Math.floor(
          (oauth.accessTokenExpiresAt?.getTime() ?? 0) / 1000
        ),
      },
    };
  }
  return null;
}

// --------- RAW STRAVA API RESPONSE ----------
export type StravaActivityApi = {
  resource_state: number;
  athlete: {
    id: number;
    resource_state: number;
  };
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  workout_type: number | null;
  id: number; // <-- Strava activity id (bigint)
  start_date: string;
  start_date_local: string;
  timezone: string;
  utc_offset: number;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  map: {
    id: string;
    summary_polyline: string;
    resource_state: number;
  };
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  visibility: "everyone" | "followers_only" | "only_me";
  flagged: boolean;
  gear_id: string | null;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  average_speed: number;
  max_speed: number;
  average_cadence?: number;
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  heartrate_opt_out: boolean;
  display_hide_heartrate_option: boolean;
  elev_high: number;
  elev_low: number;
  upload_id: number;
  upload_id_str: string;
  external_id: string | null;
  from_accepted_tag: boolean;
  pr_count: number;
  total_photo_count: number;
  has_kudoed: boolean;
  suffer_score?: number;
};

// TODO: this should probably be inline to reduce roundtrip
export const getUserTZ = cache(async function getUserTZ(user: RunTrackerUser) {
  const result = await db.execute(sql`
		SELECT regexp_replace(timezone, '.*\\)\\s*', '') AS tz
		FROM ${stravaActivities}
		WHERE ${stravaActivities.userId} = ${user.user.id}
		ORDER BY ${stravaActivities.startDate} DESC
		LIMIT 1
	`);
  return (result.rows[0] as { tz: string } | undefined)?.tz ?? "UTC";
});

export function getUserLastSundayMidnightTimestamp(
  user: RunTrackerUser,
  tz: string
) {
  return sql`
						(
							date_trunc('day', (NOW() AT TIME ZONE ${tz}))
							- make_interval(days => extract(dow from (NOW() AT TIME ZONE ${tz}))::int)
						)::timestamp
					`;
}

export function getUserLastLastSundayMidnightTimestamp(
  user: RunTrackerUser,
  tz: string
) {
  return sql`
						(
							date_trunc('day', (NOW() AT TIME ZONE ${tz}))
							- make_interval(days => extract(dow from (NOW() AT TIME ZONE ${tz}))::int + 7)
						)::timestamp
					`;
}

export async function getActivitiesLastWeekPeriod(user: RunTrackerUser) {
  const tz = await getUserTZ(user);

  console.log("Using timezone", tz);

  return db
    .select({
      name: stravaActivities.name,
      type: stravaActivities.type,
      distance: stravaActivities.distance,
      startDateLocal: stravaActivities.startDateLocal,
      averageHR: stravaActivities.averageHeartrate,
      movingTime: stravaActivities.movingTime,
      averageSpeed: stravaActivities.averageSpeed,
    })
    .from(stravaActivities)
    .where(
      and(
        eq(stravaActivities.userId, user.user.id),
        gte(
          stravaActivities.startDateLocal,
          getUserLastLastSundayMidnightTimestamp(user, tz)
        ),
        lt(
          stravaActivities.startDateLocal,
          getUserLastSundayMidnightTimestamp(user, tz)
        )
      )
    )
    .orderBy(desc(stravaActivities.startDateLocal));
}

export async function getActivitiesSinceLastSundayMidnight(
  user: RunTrackerUser
) {
  const tz = await getUserTZ(user);

  console.log("Using timezone", tz);

  return db
    .select({
      name: stravaActivities.name,
      type: stravaActivities.type,
      distance: stravaActivities.distance,
      startDateLocal: stravaActivities.startDateLocal,
      averageHR: stravaActivities.averageHeartrate,
      movingTime: stravaActivities.movingTime,
      averageSpeed: stravaActivities.averageSpeed,
    })
    .from(stravaActivities)
    .limit(30)
    .where(
      and(
        eq(stravaActivities.userId, user.user.id),
        gte(
          stravaActivities.startDateLocal,
          getUserLastSundayMidnightTimestamp(user, tz)
        ),
        lt(
          stravaActivities.startDateLocal,
          sql`(NOW() AT TIME ZONE ${tz})::timestamp`
        )
      )
    )
    .orderBy(desc(stravaActivities.startDateLocal));
}

export async function getActivityFromStrava(args: {
  user: RunTrackerUser;
  activityId: string;
}) {
  const refreshedUser = await checkRefresh(args.user);
  if (refreshedUser === undefined) {
    throw new Error("Failed to refresh Strava token, cannot get activity");
  }
  try {
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${args.activityId}`,
      {
        headers: {
          Authorization: `Bearer ${refreshedUser.strava.access_token}`,
        },
      }
    );

    if (!res.ok) {
      console.log(await res.text());
      return `error fetching activity`;
    }

    return res.json() as unknown as StravaActivityApi;
  } catch (e) {
    console.error("Error fetching activity from Strava", e);
    return `error fetching activity`;
  }
}

export async function getActivitiesFromStrava(user: RunTrackerUser) {
  const refreshedUser = await checkRefresh(user);
  if (refreshedUser === undefined) {
    throw new Error("Failed to refresh Strava token, cannot get activities");
  }
  const res = await fetch("https://www.strava.com/api/v3/athlete/activities", {
    headers: {
      Authorization: `Bearer ${refreshedUser.strava.access_token}`,
    },
  });
  if (!res.ok) {
    console.log(await res.text());
    throw new Error(`Error fetching activities: ${res.statusText}`);
  }
  // todo: maybe validate
  return res.json() as unknown as StravaActivityApi[];
}

export async function pullLast30ActivitiesFromStrava(user: RunTrackerUser) {
  const activities = await getActivitiesFromStrava(user);

  // shape → DB rows
  const values = activities.map((a) =>
    stravaApiToPersistedActivity(a, user.user.id)
  );

  const result = await db
    .insert(stravaActivities)
    .values(values)
    .onConflictDoNothing({
      target: [stravaActivities.userId, stravaActivities.stravaActivityId],
    });
  revalidatePath("/");

  return {
    requested: activities.length,
    inserted: Array.isArray(result) ? result.length : undefined, // driver-dependent
  };
}

type StravaRefreshTokenResponse = {
  token_type: "Bearer";
  expires_at: number; // epoch seconds
  expires_in: number; // seconds until expiration
  refresh_token: string;
  access_token: string;
};

const refreshMutex = new Map<string, Promise<RunTrackerUser | undefined>>();

async function checkRefresh(
  user: RunTrackerUser
): Promise<RunTrackerUser | undefined> {
  const now = Math.floor(Date.now() / 1000);
  if (user.strava.expires_at > now + 120) {
    return user;
  }
  const existing = refreshMutex.get(user.user.id);
  if (existing) {
    return existing;
  }
  const doRefresh = async () => {
    try {
      console.log("Refreshing Strava token");
      const newTokensResponse = await fetch(
        "https://www.strava.com/api/v3/oauth/token",
        {
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
        }
      );
      const newTokens =
        (await newTokensResponse.json()) as StravaRefreshTokenResponse;
      if (!newTokensResponse.ok) {
        console.error("Error refreshing Strava token", newTokens);
        throw new Error("Error refreshing Strava token");
      }
      await db
        .update(oauthAccounts)
        .set({
          accessTokenEnc: newTokens.access_token,
          refreshTokenEnc: newTokens.refresh_token,
          accessTokenExpiresAt: new Date(newTokens.expires_at * 1000),
        })
        .where(eq(oauthAccounts.userId, user.user.id));
      return {
        ...user,
        strava: {
          ...user.strava,
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: newTokens.expires_at,
        },
      };
    } catch (e) {
      console.log(`failed to refresh strava token for user ${user.user.id}`, e);
    } finally {
      refreshMutex.delete(user.user.id);
    }
  };
  const p = doRefresh();
  refreshMutex.set(user.user.id, p);
  return p;
}

export function stravaApiToPersistedActivity(
  a: StravaActivityApi,
  userId: string
): typeof stravaActivities.$inferInsert {
  const startLat = a.start_latlng ? a.start_latlng[0] : null;
  const startLng = a.start_latlng ? a.start_latlng[1] : null;
  const endLat = a.end_latlng ? a.end_latlng[0] : null;
  const endLng = a.end_latlng ? a.end_latlng[1] : null;

  return {
    userId,
    athleteId: a.athlete.id, // schema is bigint(mode: 'number')
    stravaActivityId: a.id, // schema is bigint(mode: 'number')

    resourceState: a.resource_state,
    name: a.name,
    type: a.type,
    sportType: a.sport_type,
    workoutType: a.workout_type ?? null,

    distance: a.distance,
    movingTime: a.moving_time,
    elapsedTime: a.elapsed_time,
    totalElevationGain: a.total_elevation_gain,

    startDate: new Date(a.start_date), // UTC
    startDateLocal: new Date(a.start_date_local), // stored as timestamp w/o tz
    timezone: a.timezone,
    utcOffsetSeconds: a.utc_offset,

    locationCity: a.location_city ?? null,
    locationState: a.location_state ?? null,
    locationCountry: a.location_country ?? null,

    achievementCount: a.achievement_count,
    kudosCount: a.kudos_count,
    commentCount: a.comment_count,
    athleteCount: a.athlete_count,
    photoCount: a.photo_count,
    prCount: a.pr_count,
    totalPhotoCount: a.total_photo_count,

    mapId: a.map?.id ?? null,
    summaryPolyline: a.map?.summary_polyline ?? null,

    trainer: a.trainer,
    commute: a.commute,
    manual: a.manual,
    private: a.private,
    visibility: a.visibility,
    flagged: a.flagged,
    fromAcceptedTag: a.from_accepted_tag,

    gearId: a.gear_id ?? null,

    startLat,
    startLng,
    endLat,
    endLng,

    averageSpeed: a.average_speed,
    maxSpeed: a.max_speed,
    averageCadence: a.average_cadence ?? null,
    hasHeartrate: a.has_heartrate,
    averageHeartrate: a.average_heartrate ?? null,
    maxHeartrate: a.max_heartrate ?? null,
    heartrateOptOut: a.heartrate_opt_out,
    displayHideHeartrateOption: a.display_hide_heartrate_option,
    elevHigh: a.elev_high,
    elevLow: a.elev_low,
    sufferScore: a.suffer_score ?? null,

    uploadId: a.upload_id,
    uploadIdStr: a.upload_id_str,
    externalId: a.external_id ?? null,
  };
}
