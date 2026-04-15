import { db } from "@/server/db";
import { stravaActivities, userTable, weeklyTarget } from "@/server/schema";
import { AuthenticatedUser } from "@/server/session";
import {
  getUserLatestStrategyByUserId,
  isDeloadWeekForStrategy,
  isDeloadWeekForStrategyAtOffset,
} from "@/server/strategies";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

const PACIFIC_TIMEZONE = "America/Los_Angeles";

function getCurrentPacificWeekStartTimestamp() {
  return sql`
    (
      date_trunc('day', (NOW() AT TIME ZONE ${PACIFIC_TIMEZONE}))
      - make_interval(days => ((extract(dow from (NOW() AT TIME ZONE ${PACIFIC_TIMEZONE}))::int + 6) % 7))
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

function getPacificWeekStartTimestamptzAtOffset(weeksAgo: number) {
  return sql`((${getCurrentPacificWeekStartTimestamp()} - make_interval(days => ${
    weeksAgo * 7
  })) AT TIME ZONE ${PACIFIC_TIMEZONE})`;
}

async function getWeeklyMovingSecondsByWeekOffset(
  userId: string,
  weeksAgo: number
) {
  const weeklyActivitiesAggregate = await db
    .select({
      totalMovingTime: sql<number>`COALESCE(SUM(${stravaActivities.movingTime}), 0)`,
    })
    .from(stravaActivities)
    .where(
      and(
        eq(stravaActivities.userId, userId),
        gte(
          stravaActivities.startDate,
          getPacificWeekStartTimestamptzAtOffset(weeksAgo)
        ),
        lt(
          stravaActivities.startDate,
          getPacificWeekStartTimestamptzAtOffset(weeksAgo - 1)
        )
      )
    )
    .limit(1);

  return Number(weeklyActivitiesAggregate[0]?.totalMovingTime ?? 0);
}

async function getWeekTargetByUserIdAndOffset(userId: string, weeksAgo: number) {
  const targets = await db
    .select()
    .from(weeklyTarget)
    .where(
      and(
        eq(weeklyTarget.userId, userId),
        gte(weeklyTarget.createdAt, getPacificWeekStartTimestamptzAtOffset(weeksAgo)),
        lt(
          weeklyTarget.createdAt,
          getPacificWeekStartTimestamptzAtOffset(weeksAgo - 1)
        )
      )
    )
    .orderBy(desc(weeklyTarget.createdAt))
    .limit(1);

  return targets[0] ?? null;
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
  const shouldUsePreDeloadWeekAsBase = Boolean(
    userStrategy &&
      !isDeloadWeekForStrategy(userStrategy) &&
      isDeloadWeekForStrategyAtOffset(userStrategy, -1)
  );
  let baseWeekOffset = shouldUsePreDeloadWeekAsBase ? 2 : 1;

  let baseWeekTarget = await getWeekTargetByUserIdAndOffset(userId, baseWeekOffset);
  let baseWeekSumActiveSeconds = await getWeeklyMovingSecondsByWeekOffset(
    userId,
    baseWeekOffset
  );

  if (baseWeekOffset === 2 && baseWeekSumActiveSeconds <= 0) {
    baseWeekOffset = 1;
    baseWeekTarget = await getWeekTargetByUserIdAndOffset(userId, baseWeekOffset);
    baseWeekSumActiveSeconds = await getWeeklyMovingSecondsByWeekOffset(
      userId,
      baseWeekOffset
    );
  }

  console.log({ baseWeekOffset, baseWeekSumActiveSeconds });

  if (baseWeekSumActiveSeconds <= 0) {
    return {
      target: null,
      created: false,
    };
  }

  let newThisWeekActiveSeconds = 0;
  const base =
    baseWeekTarget &&
    Number(baseWeekTarget.activeSeconds) < baseWeekSumActiveSeconds
      ? Number(baseWeekTarget.activeSeconds)
      : baseWeekSumActiveSeconds;
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
  const lastWeekTarget = await getWeekTargetByUserIdAndOffset(userId, 1);
  return lastWeekTarget ? [lastWeekTarget] : [];
}
