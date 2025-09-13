import ProgressionStrategyForm from "@/app/ProgressionStrategyForm";
import { getCurrentSession } from "@/server/session";
import { getActivitiesLastWeekPeriod } from "@/server/strava";
import Link from "next/link";

export default async function ProgressionStrategyPage() {
  const session = await getCurrentSession();
  if (!session.user) {
    return <div>Please log in to view this page.</div>;
  }
  const lastWeekActivities = await getActivitiesLastWeekPeriod(session.user);

  return (
    <div className="flex flex-col items-start gap-6">
      <Link href="/">Back</Link>
      <ProgressionStrategyForm previousWeekActivities={lastWeekActivities} />
    </div>
  );
}
