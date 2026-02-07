import { getCurrentSession } from "@/server/session";
import { getStravaAccountForUser } from "@/server/strava";
import Link from "next/link";

export default async function LinkAccountsPage() {
  const { user } = await getCurrentSession();
  if (user === null) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div>Sign in to Run Tracker</div>
        <a href="/login/google">
          <button className="border px-3 py-2">Continue with Google</button>
        </a>
      </div>
    );
  }

  const stravaAccount = await getStravaAccountForUser(user);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>You are signed in.</div>
      {stravaAccount ? (
        <div className="flex flex-col gap-2">
          <div>
            Strava linked as{" "}
            <span className="font-semibold">
              {stravaAccount.strava.athlete.firstname}{" "}
              {stravaAccount.strava.athlete.lastname}
            </span>
          </div>
          <Link href="/">
            <button className="border px-3 py-2">Go to dashboard</button>
          </Link>
        </div>
      ) : (
        <a href="/login/strava">
          <button className="border px-3 py-2">Link Strava</button>
        </a>
      )}
    </div>
  );
}
