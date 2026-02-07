import { db } from "@/server/db";
import { ProgressionStrategy, progressionStrategy } from "@/server/schema";
import { AuthenticatedUser } from "@/server/session";
import { eq, desc } from "drizzle-orm";

export async function getUserLatestStrategy(user: AuthenticatedUser) {
  const userStrategyResp = await db
    .select()
    .from(progressionStrategy)
    .where(eq(progressionStrategy.userId, user.user.id))
    .orderBy(desc(progressionStrategy.createdAt))
    .limit(1);

  return userStrategyResp.at(0);
}

export function isDeloadWeekForStrategy(strategy: ProgressionStrategy) {
  if (
    strategy.deloadEveryNWeeks === null ||
    strategy.deloadMultiplier === null
  ) {
    return false;
  }
  const thisWeekStartSunday = new Date();
  thisWeekStartSunday.setHours(0, 0, 0, 0);
  thisWeekStartSunday.setDate(
    thisWeekStartSunday.getDate() - thisWeekStartSunday.getDay()
  );

  if (thisWeekStartSunday < strategy.anchorDate) {
    return false;
  }

  const aUTC = Date.UTC(
    thisWeekStartSunday.getFullYear(),
    thisWeekStartSunday.getMonth(),
    thisWeekStartSunday.getDate()
  );
  const bUTC = Date.UTC(
    strategy.anchorDate.getFullYear(),
    strategy.anchorDate.getMonth(),
    strategy.anchorDate.getDate()
  );
  const days = Math.round((bUTC - aUTC) / 86_400_000);
  const weeksSinceAnchorStart = Math.floor(days / 7);

  if (
    weeksSinceAnchorStart &&
    weeksSinceAnchorStart % Number(strategy.deloadEveryNWeeks) === 0
  ) {
    return true;
  }
  return false;
}
