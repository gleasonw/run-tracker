import { db } from "@/server/db";
import { weeklyTarget } from "@/server/schema";
import { RunTrackerUser } from "@/server/session";
import {
  getActivitiesLastWeekPeriod,
  getUserLastLastSundayMidnightTimestamp,
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
  if (targetsForThisWeek.length > 0) {
    return targetsForThisWeek[0];
  }

  const lastWeekTargetResponse = await getLastWeekTarget(user);
  const lastWeekTarget = lastWeekTargetResponse[0];
  const lastWeekActivities = await getActivitiesLastWeekPeriod(user);
  if (lastWeekActivities.length === 0) {
    // TODO: we should probably do something smarter here
    // for now we just let the user set a manual target in the UI
    return null;
  }
  const lastWeekSumActiveSeconds = lastWeekActivities.reduce(
    (acc, activity) => {
      return acc + activity.movingTime;
    },
    0
  );
  let newThisWeekActiveSeconds = 0;

  if (
    lastWeekTarget &&
    lastWeekTarget.activeSeconds < lastWeekSumActiveSeconds
  ) {
    // the user exceeded their target last week, don't rely on the actual
    newThisWeekActiveSeconds = Math.round(lastWeekTarget.activeSeconds * 1.1);
  } else {
    // the user didn't meet their target last week, so use actuals
    newThisWeekActiveSeconds = Math.round(lastWeekSumActiveSeconds * 1.1);
  }

  const newTarget = await db
    .insert(weeklyTarget)
    .values({
      userId: user.user.id,
      activeSeconds: newThisWeekActiveSeconds,
      source: "auto",
    })
    .returning();
  return newTarget[0];
}

export async function getLastWeekTarget(user: RunTrackerUser) {
  const userTz = await getUserTZ(user);
  return await db
    .select()
    .from(weeklyTarget)
    .where(
      and(
        eq(weeklyTarget.userId, user.user.id),
        gte(
          weeklyTarget.createdAt,
          getUserLastLastSundayMidnightTimestamp(user, userTz)
        ),
        lt(
          weeklyTarget.createdAt,
          getUserLastSundayMidnightTimestamp(user, userTz)
        )
      )
    )
    .orderBy(desc(weeklyTarget.createdAt))
    .limit(1);
}
