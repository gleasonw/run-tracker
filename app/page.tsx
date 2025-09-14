import { WeeklyTargetForm } from "@/app/WeeklyTargetForm";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { importFirst30Activities } from "@/server/actions";
import { db } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import { eq, desc } from "drizzle-orm";
import { getActivitiesSinceLastSundayMidnight } from "@/server/strava";
import { getThisWeekTarget as getThisWeekTargetOrMakeNew } from "@/server/targets";
import { Edit } from "lucide-react";
import Link from "next/link";
import { progressionStrategy } from "@/server/schema";
import { getUserLatestStrategy } from "@/server/strategies";

export default async function Home() {
  const session = await getCurrentSession();
  if (!session.user) {
    return (
      <div>
        Please log in here: <Link href="/link">Login</Link>
      </div>
    );
  }
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
  return (
    <div className="flex flex-col items-start gap-6 p-6">
      <div className="flex items-center gap-4">
        <img
          className="h-10 w-10"
          src={session.user?.strava.athlete.profile}
          alt="profile"
        />
        {userStrategy ? (
          <div>
            <pre>{userStrategy.capTargetSeconds}</pre>
          </div>
        ) : (
          <Link href="/progressionStrategy">
            <Button variant="outline">Create progression strategy</Button>
          </Link>
        )}
        <Button
          variant="outline"
          onClick={importFirst30Activities}
          className="border p-3 hover:bg-gray-200 hover:cursor-pointer"
        >
          Import latest activities{" "}
        </Button>
      </div>
      {thisWeekTarget === null || thisWeekTarget === undefined ? (
        <WeeklyTargetForm />
      ) : (
        <>
          <div className="flex items-center gap-4 w-full">
            <h1 className="flex gap-2 align-bottom">
              <span className="font-bold text-xl">
                {Math.round(Number(thisWeekTarget.activeSeconds) / 60)} minutes{" "}
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
              </span>
            </h1>
          </div>
          <div>
            {toRunMinutes > 0 ? (
              <div>
                Maybe run <span className="font-bold">{toRunMinutes}</span> more
                minutes
              </div>
            ) : (
              <div>
                You have achieved your goal by running{" "}
                <span className="font-semibold">
                  {Math.round(thisWeekActivitiesSumMinutes)}
                </span>{" "}
                minutes
              </div>
            )}
          </div>
        </>
      )}

      <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden shadow">
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
