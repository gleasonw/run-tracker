"use client";

import { createWeeklyTarget } from "@/server/actions";
import { WeeklyTargetInsert } from "@/server/schema";
import React from "react";

export function WeeklyTargetForm({
  existingTarget,
}: {
  existingTarget?: WeeklyTargetInsert;
}) {
  const [minutes, setMinutes] = React.useState(
    existingTarget?.activeSeconds
      ? (Number(existingTarget.activeSeconds) / 60).toString()
      : ""
  );
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      onSubmit={() =>
        startTransition(() => {
          createWeeklyTarget({
            activeSeconds: (parseInt(minutes) * 60).toString(),
            source: "manual",
          });
        })
      }
      className="w-full max-w-sm p-4 bg-white rounded-2xl shadow"
    >
      <h2 className="text-lg font-semibold mb-4">Create Weekly Target</h2>

      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Minutes</label>
        <input
          type="number"
          min="0"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save Target"}
      </button>
    </form>
  );
}
