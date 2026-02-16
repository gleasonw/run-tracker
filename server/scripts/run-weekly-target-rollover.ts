import "dotenv/config";
import { Console, Effect } from "effect";
import { generateWeeklyTargetsForAllUsers } from "../targets";

const runWeeklyTargetRollover = Effect.gen(function* () {
  const startedAt = new Date().toISOString();
  yield* Console.log(`[weekly-target-rollover] started at ${startedAt}`);

  const summary = yield* Effect.tryPromise({
    try: () => generateWeeklyTargetsForAllUsers(),
    catch: (error) =>
      new Error(
        `Failed weekly target rollover: ${
          error instanceof Error ? error.message : String(error)
        }`
      ),
  });

  yield* Console.log(
    `[weekly-target-rollover] processed=${summary.processedUsers} created=${summary.createdTargets} skipped=${summary.skippedUsers} failed=${summary.failedUsers}`
  );
});

Effect.runPromise(
  Effect.tapError(runWeeklyTargetRollover, (error) =>
    Console.error(`[weekly-target-rollover] ${error.message}`)
  )
).catch(() => {
  process.exitCode = 1;
});
