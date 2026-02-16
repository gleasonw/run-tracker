import { db } from "@/server/db";
import { stravaActivities, userTable, weeklyTarget } from "@/server/schema";
import { AuthenticatedUser } from "@/server/session";
import {
  getUserLatestStrategyByUserId,
  isDeloadWeekForStrategy,
} from "@/server/strategies";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

const PACIFIC_TIMEZONE = "America/Los_Angeles";

function getCurrentPacificWeekStartTimestamp() {
  return sql`
    (
      date_trunc('day', (NOW() AT TIME ZONE ${PACIFIC_TIMEZONE}))
      - make_interval(days => extract(dow from (NOW() AT TIME ZONE ${PACIFIC_TIMEZONE}))::int)
    )::timestamp
  `;
}

function getPreviousPacificWeekStartTimestamp() {
  return sql`
    (
      ${getCurrentPacificWeekStartTimestamp()}
      - interval '7 days'
    )::timestamp
  `;
}

function getCurrentPacificWeekStartTimestamptz() {
  return sql`(${getCurrentPacificWeekStartTimestamp()} AT TIME ZONE ${PACIFIC_TIMEZONE})`;
}

function getPreviousPacificWeekStartTimestamptz() {
  return sql`(${getPreviousPacificWeekStartTimestamp()} AT TIME ZONE ${PACIFIC_TIMEZONE})`;
}

export async function getThisWeekTarget(user: AuthenticatedUser) {
  const targetsForThisWeek = await db
    .select()
    .from(weeklyTarget)
    .where(
      and(
        eq(weeklyTarget.userId, user.user.id),
        gte(weeklyTarget.createdAt, getCurrentPacificWeekStartTimestamptz())
      )
    )
    .orderBy(desc(weeklyTarget.createdAt))
    .limit(1);

  return targetsForThisWeek[0] ?? null;
}

export async function createThisWeekTargetFromLastWeek(userId: string) {
  const existingTarget = await db
    .select()
    .from(weeklyTarget)
    .where(
      and(
        eq(weeklyTarget.userId, userId),
        gte(weeklyTarget.createdAt, getCurrentPacificWeekStartTimestamptz())
      )
    )
    .orderBy(desc(weeklyTarget.createdAt))
    .limit(1);

  console.log({ existingTarget });

  if (existingTarget.length > 0) {
    return {
      target: existingTarget[0],
      created: false,
    };
  }

  const userStrategy = await getUserLatestStrategyByUserId(userId);
  const lastWeekTargetResponse = await getLastWeekTargetByUserId(userId);
  const lastWeekTarget = lastWeekTargetResponse[0];
  const lastWeekActivitiesAggregate = await db
    .select({
      totalMovingTime: sql<number>`COALESCE(SUM(${stravaActivities.movingTime}), 0)`,
    })
    .from(stravaActivities)
    .where(
      and(
        eq(stravaActivities.userId, userId),
        gte(
          stravaActivities.startDate,
          getPreviousPacificWeekStartTimestamptz()
        ),
        lt(stravaActivities.startDate, getCurrentPacificWeekStartTimestamptz())
      )
    )
    .limit(1);
  const lastWeekSumActiveSeconds = Number(
    lastWeekActivitiesAggregate[0]?.totalMovingTime ?? 0
  );

  console.log({ lastWeekSumActiveSeconds });

  if (lastWeekSumActiveSeconds <= 0) {
    return {
      target: null,
      created: false,
    };
  }

  let newThisWeekActiveSeconds = 0;
  const base =
    lastWeekTarget &&
    Number(lastWeekTarget.activeSeconds) < lastWeekSumActiveSeconds
      ? Number(lastWeekTarget.activeSeconds)
      : lastWeekSumActiveSeconds;
  if (userStrategy) {
    if (
      isDeloadWeekForStrategy(userStrategy) &&
      userStrategy.deloadMultiplier
    ) {
      newThisWeekActiveSeconds = base * userStrategy.deloadMultiplier;
    } else {
      newThisWeekActiveSeconds =
        base * (userStrategy.weekProgressionMultiplier ?? 1.1);
    }
  } else {
    newThisWeekActiveSeconds = base * 1.1;
  }

  const newTarget = await db
    .insert(weeklyTarget)
    .values({
      userId,
      activeSeconds: newThisWeekActiveSeconds.toString(),
      source: "auto",
    })
    .returning();
  return {
    target: newTarget[0],
    created: true,
  };
}

export async function generateWeeklyTargetsForAllUsers() {
  const users = await db.select({ id: userTable.id }).from(userTable);
  let createdTargets = 0;
  let failedUsers = 0;

  for (const user of users) {
    try {
      const result = await createThisWeekTargetFromLastWeek(user.id);
      if (result.created) {
        createdTargets += 1;
      }
    } catch (error) {
      failedUsers += 1;
      console.error("Failed weekly target generation for user", user.id, error);
    }
  }

  return {
    processedUsers: users.length,
    createdTargets,
    skippedUsers: users.length - createdTargets - failedUsers,
    failedUsers,
  };
}

export async function getLastWeekTarget(user: AuthenticatedUser) {
  return getLastWeekTargetByUserId(user.user.id);
}

export async function getLastWeekTargetByUserId(userId: string) {
  return db
    .select()
    .from(weeklyTarget)
    .where(
      and(
        eq(weeklyTarget.userId, userId),
        gte(weeklyTarget.createdAt, getPreviousPacificWeekStartTimestamptz()),
        lt(weeklyTarget.createdAt, getCurrentPacificWeekStartTimestamptz())
      )
    )
    .orderBy(desc(weeklyTarget.createdAt))
    .limit(1);
}
