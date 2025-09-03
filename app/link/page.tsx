import { stravaAuthUrl } from "@/server/strava";

export default function LinkStrava() {
  return (
    <div>
      Hello.
      <a href={stravaAuthUrl.toString()}>
        <button className="border">Link strava</button>
      </a>
    </div>
  );
}
