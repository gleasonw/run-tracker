import { getCurrentSession } from "@/server/session";
import { getActivities } from "@/server/strava";
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
  console.log("session", session.user?.strava);
  const test = await getActivities();
  return (
    <div>
      Hello, {session.user?.strava.athlete.firstname}
      <img src={session.user?.strava.athlete.profile} alt="profile" />
      <pre>{JSON.stringify(test, null, 2)}</pre>
    </div>
  );
}
