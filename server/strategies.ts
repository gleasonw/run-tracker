import { db } from "@/server/db";
import { ProgressionStrategy, progressionStrategy } from "@/server/schema";
import { AuthenticatedUser } from "@/server/session";
import { and, eq, desc } from "drizzle-orm";

export async function getUserLatestStrategy(user: AuthenticatedUser) {
  return getUserLatestStrategyByUserId(user.user.id);
}

export async function getUserLatestStrategyByUserId(userId: string) {
  const userStrategyResp = await db
    .select()
    .from(progressionStrategy)
    .where(
      and(
        eq(progressionStrategy.userId, userId),
        eq(progressionStrategy.active, true)
      )
    )
    .orderBy(desc(progressionStrategy.createdAt))
    .limit(1);

  return userStrategyResp.at(0);
}

export function isDeloadWeekForStrategy(strategy: ProgressionStrategy) {
  return isDeloadWeekForStrategyAtOffset(strategy, 0);
}

export function isDeloadWeekForStrategyAtOffset(
  strategy: ProgressionStrategy,
  offsetWeeks: number
) {
  if (
    strategy.deloadEveryNWeeks === null ||
    strategy.deloadMultiplier === null
  ) {
    return false;
  }
  const thisWeekStartSunday = getStartOfWeekSunday(new Date());
  const anchorWeekSunday = getStartOfWeekSunday(strategy.anchorDate);
  if (thisWeekStartSunday < anchorWeekSunday) {
    return false;
  }

  const weeksSinceAnchorStart = Math.floor(
    (thisWeekStartSunday.getTime() - anchorWeekSunday.getTime()) / 604_800_000
  );
  const weekIndex = weeksSinceAnchorStart + offsetWeeks;

  return (
    weekIndex > 0 &&
    weekIndex % Number(strategy.deloadEveryNWeeks) === 0
  );
}

function getStartOfWeekSunday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
