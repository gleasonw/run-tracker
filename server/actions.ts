"use server";

import { db } from "@/server/db";
import {
  progressionStrategy,
  ProgressionStrategyInsert,
  weeklyTarget,
  WeeklyTargetInsert,
} from "@/server/schema";
import { getCurrentSession } from "@/server/session";
import {
  getUserLastSundayMidnightTimestamp,
  getUserTZ,
  pullLast30ActivitiesFromStrava,
} from "@/server/strava";
import { revalidatePath } from "next/cache";

// the idea here is that we have a server action layer that I
// believe is publicly exposed, so we need to be careful about
// validating the user is authenticated
export async function importFirst30Activities() {
  const { user } = await getCurrentSession();
  if (user === null) {
    throw new Error("Not authenticated");
  }
  return pullLast30ActivitiesFromStrava(user);
}

export async function createWeeklyTarget(target: WeeklyTargetInsert) {
  const { user } = await getCurrentSession();
  if (user === null) {
    throw new Error("Not authenticated");
  }
  const newTarget = await db
    .insert(weeklyTarget)
    .values({
      userId: user.user.id,
      activeSeconds: target.activeSeconds,
      source: target.source,
    })
    .returning();
  revalidatePath("/");
  return newTarget[0];
}

export async function createProgressionStrategy(
  strategy: Omit<ProgressionStrategyInsert, "anchorDate" | "userId">
) {
  const { user } = await getCurrentSession();
  if (user === null) {
    throw new Error("Not authenticated");
  }
  const nextSundayMidnight = new Date();
  nextSundayMidnight.setHours(0, 0, 0, 0);
  const dow = nextSundayMidnight.getDate();
  const daysToNextSunday = (7 - dow) % 7 || 7;
  nextSundayMidnight.setDate(nextSundayMidnight.getDate() + daysToNextSunday);
  const newStrategy = await db
    .insert(progressionStrategy)
    .values({
      userId: user.user.id,
      name: strategy.name,
      anchorDate: nextSundayMidnight,
      capTargetSeconds: strategy.capTargetSeconds,
      deloadEveryNWeeks: strategy.deloadEveryNWeeks,
      deloadMultiplier: strategy.deloadMultiplier,
      weekProgressionMultiplier: strategy.weekProgressionMultiplier,
      active: strategy.active,
    })
    .returning();
  revalidatePath("/progressionStrategy");
  return newStrategy[0];
}
