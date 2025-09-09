import { WeeklyTargetForm } from "@/app/WeeklyTargetForm";
import { importFirst30Activities } from "@/server/actions";
import { db } from "@/server/db";
import { getCurrentSession } from "@/server/session";
import {
  getActivitiesLastWeekPeriod,
  getActivitiesSinceLastSundayMidnight,
} from "@/server/strava";
import { getThisWeekTarget } from "@/server/targets";
import Link from "next/link";

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
  const thisWeekTarget = await getThisWeekTarget(session.user);
  const thisWeekActivitiesSumMinutes = activitiesSince.reduce(
    (acc, activity) => {
      return acc + activity.movingTime / 60;
    },
    0
  );
  const lastWeekActivities = await getActivitiesLastWeekPeriod(session.user);
  return (
    <div className="flex flex-col items-start gap-6 p-6">
      <div className="flex items-center gap-4">
        <img
          className="h-10 w-10"
          src={session.user?.strava.athlete.profile}
          alt="profile"
        />
        <button
          onClick={importFirst30Activities}
          className="border p-3 hover:bg-gray-200 hover:cursor-pointer"
        >
          Import latest activities{" "}
        </button>
      </div>
      {thisWeekTarget === null || thisWeekTarget === undefined ? (
        <WeeklyTargetForm />
      ) : (
        <>
          <div className="flex items-center gap-4 w-full">
            <h1 className="flex gap-2 align-bottom">
              <span className="font-bold text-xl">
                {Math.round(thisWeekTarget.activeSeconds / 60)} minutes 🎯
              </span>
            </h1>
          </div>
          <div>
            Maybe run{" "}
            <span className="font-bold">
              {Math.round(
                thisWeekTarget.activeSeconds / 60 - thisWeekActivitiesSumMinutes
              )}
            </span>{" "}
            more minutes
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
                {formatKm(act.distance)}
              </td>
              <td className="px-4 py-2 text-sm text-right">
                {formatMinutes(act.movingTime)}
              </td>
              <td className="px-4 py-2 text-sm text-right">
                {act.averageHR ? Math.round(act.averageHR) : "-"}
              </td>
              <td className="px-4 py-2 text-sm text-right">
                {act.averageSpeed.toFixed(2)} m/s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMinutes(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(1)} km`;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
