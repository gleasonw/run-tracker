import { db } from "@/server/db";
import { weeklyTarget } from "@/server/schema";
import { RunTrackerUser } from "@/server/session";
import {
  getActivitiesLastWeekPeriod,
  getUserLastSundayMidnightTimestamp,
  getUserTZ,
} from "@/server/strava";
import { and, eq, gte, lt, sql, desc } from "drizzle-orm";

export async function getThisWeekTarget(user: RunTrackerUser) {
  const userTz = await getUserTZ(user);
  const targetsForThisWeek = await db
    .select()
    .from(weeklyTarget)
    .where(
      and(
        eq(weeklyTarget.userId, user.user.id),
        gte(
          weeklyTarget.createdAt,
          getUserLastSundayMidnightTimestamp(user, userTz)
        )
      )
    )
    .orderBy(desc(weeklyTarget.createdAt));
  console.log({ targetsForThisWeek });
  if (targetsForThisWeek.length > 0) {
    return targetsForThisWeek[0];
  }
  // create a new target, inferring from last week's activities total, bumping by 10%
  const lastWeekActivities = await getActivitiesLastWeekPeriod(user);
  if (lastWeekActivities.length === 0) {
    return null;
  }
  const lastWeekSumActiveSeconds = lastWeekActivities.reduce(
    (acc, activity) => {
      return acc + activity.movingTime;
    },
    0
  );
  const newTarget = await db
    .insert(weeklyTarget)
    .values({
      userId: user.user.id,
      activeSeconds: Math.round(lastWeekSumActiveSeconds * 1.1),
      source: "auto",
    })
    .returning();
  return newTarget[0];
}
