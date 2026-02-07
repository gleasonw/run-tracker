import { WeeklyTargetForm } from "@/app/WeeklyTargetForm";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { importFirst30Activities } from "@/server/actions";
import { getCurrentSession } from "@/server/session";
import {
  getActivitiesSinceLastSundayMidnight,
  getStravaAccountForUser,
} from "@/server/strava";
import { getThisWeekTarget as getThisWeekTargetOrMakeNew } from "@/server/targets";
import { Edit } from "lucide-react";
import Link from "next/link";
import { getUserLatestStrategy } from "@/server/strategies";

export default async function Home() {
  const session = await getCurrentSession();
  if (!session.user) {
    return (
      <div>
        Please sign in here: <Link href="/link">Login with Google</Link>
      </div>
    );
  }
  const stravaUser = await getStravaAccountForUser(session.user);
  const activitiesSince = await getActivitiesSinceLastSundayMidnight(
    session.user
  );
  const userStrategy = await getUserLatestStrategy(session.user);
  // TODO: we should probably do this in a cron or something, rather than on page visit.
  const thisWeekTarget = await getThisWeekTargetOrMakeNew(session.user);
  const thisWeekActivitiesSumMinutes = activitiesSince.reduce(
    (acc, activity) => {
      return acc + activity.movingTime / 60;
    },
    0
  );

  const toRunMinutes = thisWeekTarget
    ? Math.round(
        Number(thisWeekTarget.activeSeconds) / 60 - thisWeekActivitiesSumMinutes
      )
    : 0;
  const thisWeekTargetMinutes = thisWeekTarget
    ? Math.round(Number(thisWeekTarget.activeSeconds) / 60)
    : null;
  const thisWeekCompletedMinutes = Math.round(thisWeekActivitiesSumMinutes);

  return (
    <div className="flex flex-col items-start gap-6 p-6">
      <div className="flex items-center gap-4">
        {stravaUser ? (
          <img
            className="h-10 w-10"
            src={stravaUser.strava.athlete.profile}
            alt="profile"
          />
        ) : (
          <Link href="/link">
            <Button variant="outline">Link Strava</Button>
          </Link>
        )}
        <Link href="/progressionStrategy">
          <Button variant="outline">
            {userStrategy
              ? "Manage progression strategy"
              : "Create progression strategy"}
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={importFirst30Activities}
          disabled={!stravaUser}
          className="border p-3 hover:bg-gray-200 hover:cursor-pointer"
        >
          {stravaUser ? "Import latest activities" : "Link Strava to import"}
        </Button>
      </div>

      {thisWeekTarget === null || thisWeekTarget === undefined ? (
        <WeeklyTargetForm />
      ) : (
        <div className="w-full">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  This Week Goal
                </p>
                <h1 className="text-3xl font-bold">
                  {thisWeekTargetMinutes} min
                  <span className="ml-2 text-base font-medium text-gray-500">
                    this week
                  </span>
                </h1>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" aria-label={"Edit target"}>
                    <Edit />
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
                  <WeeklyTargetForm existingTarget={thisWeekTarget} />
                </PopoverContent>
              </Popover>
            </div>

            <p className="mt-3 text-base">
              {toRunMinutes > 0 ? (
                <>
                  Maybe run <span className="font-bold">{toRunMinutes}</span>{" "}
                  more minutes this week.
                </>
              ) : (
                <>
                  You have achieved this week&apos;s goal by running{" "}
                  <span className="font-semibold">
                    {thisWeekCompletedMinutes}
                  </span>{" "}
                  minutes.
                </>
              )}
            </p>
          </section>
        </div>
      )}

      <div className="w-full">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          This Week Activities
        </h2>

        <div className="md:hidden space-y-3">
          {activitiesSince.map((act) => (
            <article
              key={act.name + act.startDateLocal}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold leading-tight">
                  {act.name}
                </h3>
                <span className="text-sm text-gray-500 shrink-0">
                  {dateFormatter.format(new Date(act.startDateLocal))}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    Distance
                  </dt>
                  <dd>{kmToMiles(act.distance)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    Time
                  </dt>
                  <dd>{formatMinutes(act.movingTime)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    Avg HR
                  </dt>
                  <dd>{act.averageHR ? Math.round(act.averageHR) : "-"}</dd>
                </div>
                <div className="col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    Speed
                  </dt>
                  <dd>{metersPerSecondToMinutesPerMile(act.averageSpeed)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <table className="hidden md:table min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden shadow">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">
                Name
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">
                Date
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">
                Distance
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">
                Time
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">
                Avg HR
              </th>
              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-600">
                Speed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {activitiesSince.map((act) => (
              <tr key={act.name + act.startDateLocal}>
                <td className="px-4 py-2 text-sm">{act.name}</td>
                <td className="px-4 py-2 text-sm text-gray-500">
                  {dateFormatter.format(new Date(act.startDateLocal))}
                </td>
                <td className="px-4 py-2 text-sm text-right">
                  {kmToMiles(act.distance)}
                </td>
                <td className="px-4 py-2 text-sm text-right">
                  {formatMinutes(act.movingTime)}
                </td>
                <td className="px-4 py-2 text-sm text-right">
                  {act.averageHR ? Math.round(act.averageHR) : "-"}
                </td>
                <td className="px-4 py-2 text-sm text-right">
                  {metersPerSecondToMinutesPerMile(act.averageSpeed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function metersPerSecondToMinutesPerMile(metersPerSecond: number) {
  const kmPerSecond = metersPerSecond / 1000;
  const milesPerSecond = kmPerSecond * 0.621371;
  const minutesPerMile = 1 / milesPerSecond / 60;
  const minutes = Math.floor(minutesPerMile);
  const seconds = Math.round((minutesPerMile - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")} min/mi`;
}

function formatMinutes(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

function kmToMiles(meters: number) {
  return ((meters / 1000) * 0.621371).toFixed(2) + " mi";
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
