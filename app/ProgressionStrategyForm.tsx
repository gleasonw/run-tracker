"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ProgressionStrategyInsert, RunTrackerActivity } from "@/server/schema";

export default function ProgressionStrategyForm({
  previousWeekActivities,
}: {
  previousWeekActivities: { movingTime: number }[];
}) {
  const [form, setForm] = useState({
    name: "",
    capTargetMinutes: "",
    deloadEveryNWeeks: "",
    deloadMultiplier: "",
    weekProgressionMultiplier: "",
    active: true,
  });

  const lastWeekSumActiveSeconds = previousWeekActivities?.reduce(
    (acc, activity) => acc + activity.movingTime,
    0
  );

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: send to API
    console.log(form);
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-md mx-auto p-6 bg-white rounded-2xl shadow ">
      <p>
        Last week you ran{" "}
        <span className="font-semibold">
          {Math.round(lastWeekSumActiveSeconds / 60)} minutes
        </span>
        . How do you want to progress from there?
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Every week, multiply total minutes by
          </label>
          <Input
            type="number"
            step="0.05"
            placeholder="e.g. 1.1 for 10% weekly increase"
            min="1"
            name="weekProgressionMultiplier"
            value={form.weekProgressionMultiplier}
            onChange={handleChange}
            className="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Continue to progress minutes until cap
          </label>
          <Input
            type="number"
            name="capTargetMinutes"
            value={form.capTargetMinutes}
            onChange={handleChange}
            className="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-[2fr_1fr] gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Deload Every N Weeks
            </label>
            <Input
              type="number"
              name="deloadEveryNWeeks"
              value={form.deloadEveryNWeeks}
              onChange={handleChange}
              className="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Deload Multiplier
            </label>
            <Input
              type="number"
              step="0.01"
              name="deloadMultiplier"
              value={form.deloadMultiplier}
              onChange={handleChange}
              className="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <p>
          It will take{" "}
          <span className="font-semibold">
            {weeksToReachStrategySeconds(lastWeekSumActiveSeconds, {
              capTargetSeconds: Number(form.capTargetMinutes) * 60,
              deloadEveryNWeeks: Number(form.deloadEveryNWeeks),
              deloadMultiplier: Number(form.deloadMultiplier),
              weekProgressionMultiplier: Number(form.weekProgressionMultiplier),
            })}{" "}
            weeks
          </span>{" "}
          to reach your goal of {form.capTargetMinutes} minutes a week, or{" "}
          {Math.round(Number(form.capTargetMinutes) / 60)} hours.
        </p>

        <button
          type="submit"
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Save
        </button>
      </form>
    </div>
  );
}

function weeksToReachStrategySeconds(
  baselineActiveSeconds: number,
  partialStrategy: Omit<ProgressionStrategyInsert, "anchorDate" | "name">
) {
  const {
    deloadEveryNWeeks,
    deloadMultiplier,
    weekProgressionMultiplier,
    capTargetSeconds,
  } = partialStrategy;
  if (
    capTargetSeconds === null ||
    capTargetSeconds === undefined ||
    !weekProgressionMultiplier ||
    weekProgressionMultiplier < 1
  ) {
    return Infinity;
  }

  if (
    !deloadEveryNWeeks ||
    deloadMultiplier === null ||
    deloadMultiplier === undefined
  ) {
    return Math.ceil(
      Math.log(capTargetSeconds / baselineActiveSeconds) /
        Math.log(weekProgressionMultiplier)
    );
  }

  return "tbd";

  // calculate with deload
}
