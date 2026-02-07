import ProgressionStrategyForm from "@/app/ProgressionStrategyForm";
import { Button } from "@/components/ui/button";
import { clearProgressionStrategy } from "@/server/actions";
import { getCurrentSession } from "@/server/session";
import { getActivitiesLastWeekPeriod } from "@/server/strava";
import { getThisWeekTarget } from "@/server/targets";
import {
  getUserLatestStrategy,
  isDeloadWeekForStrategy,
  isDeloadWeekForStrategyAtOffset,
} from "@/server/strategies";
import Link from "next/link";

export default async function ProgressionStrategyPage() {
  const session = await getCurrentSession();
  if (!session.user) {
    return <div>Please sign in with Google to view this page.</div>;
  }
  const lastWeekActivities = await getActivitiesLastWeekPeriod(session.user);
  const userStrategy = await getUserLatestStrategy(session.user);
  const thisWeekTarget = await getThisWeekTarget(session.user);
  const thisWeekTargetMinutes = thisWeekTarget
    ? Math.round(Number(thisWeekTarget.activeSeconds) / 60)
    : null;
  const strategyCapMinutes = userStrategy?.capTargetSeconds
    ? Math.round(userStrategy.capTargetSeconds / 60)
    : null;
  const isCurrentWeekDeload = userStrategy
    ? isDeloadWeekForStrategy(userStrategy)
    : false;
  const isNextWeekDeload = userStrategy
    ? isDeloadWeekForStrategyAtOffset(userStrategy, 1)
    : false;
  const nextWeekEstimate =
    userStrategy &&
    thisWeekTargetMinutes &&
    strategyCapMinutes &&
    userStrategy.weekProgressionMultiplier
      ? Math.round(
          Math.max(
            0,
            (isNextWeekDeload && userStrategy.deloadMultiplier
              ? Math.min(
                  thisWeekTargetMinutes * userStrategy.weekProgressionMultiplier,
                  strategyCapMinutes
                ) * userStrategy.deloadMultiplier
              : Math.min(
                  thisWeekTargetMinutes * userStrategy.weekProgressionMultiplier,
                  strategyCapMinutes
                ))
          )
        )
      : null;

  return (
    <div className="flex flex-col items-start gap-6 p-6 w-full">
      <Link href="/" className="text-sm text-gray-600 hover:underline">
        Back to dashboard
      </Link>

      {userStrategy && strategyCapMinutes ? (
        <section className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Active Progression Strategy
            </p>
            <form action={clearProgressionStrategy}>
              <Button type="submit" variant="ghost" className="text-red-600">
                Clear strategy
              </Button>
            </form>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <p className="text-gray-500">Current goal</p>
              <p className="text-lg font-semibold">
                {thisWeekTargetMinutes ?? "-"} min/week
              </p>
            </div>
            <div>
              <p className="text-gray-500">Cap goal</p>
              <p className="text-lg font-semibold">{strategyCapMinutes} min/week</p>
            </div>
            <div>
              <p className="text-gray-500">Weekly multiplier</p>
              <p className="text-lg font-semibold">
                {userStrategy.weekProgressionMultiplier ?? 1.1}x
              </p>
            </div>
            <div>
              <p className="text-gray-500">Deload</p>
              <p className="text-lg font-semibold">
                {userStrategy.deloadEveryNWeeks && userStrategy.deloadMultiplier
                  ? `every ${userStrategy.deloadEveryNWeeks} (${userStrategy.deloadMultiplier}x)`
                  : "off"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {isCurrentWeekDeload ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                Current week is deload
              </span>
            ) : null}
            {nextWeekEstimate !== null ? (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                Next week target (estimate): {nextWeekEstimate} min/week
                {isNextWeekDeload ? " (deload)" : ""}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      <ProgressionStrategyForm previousWeekActivities={lastWeekActivities} />
    </div>
  );
}
