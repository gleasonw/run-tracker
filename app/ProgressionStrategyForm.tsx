"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ProgressionStrategyInsert } from "@/server/schema";
import { Chart, Series } from "@highcharts/react";
import { createProgressionStrategy } from "@/server/actions";
import { useRouter } from "next/navigation";
type ProgressionStrategyFrom = {
  name: string;
  capTargetMinutes: string;
  deloadEveryNWeeks: string;
  deloadMultiplier: string;
  weekProgressionMultiplier: string;
  active: boolean;
};

export default function ProgressionStrategyForm({
  previousWeekActivities,
}: {
  previousWeekActivities: { movingTime: number }[];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<ProgressionStrategyFrom>({
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
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function castFormToNumber(toNumberForm: ProgressionStrategyFrom) {
    return {
      ...toNumberForm,
      capTargetMinutes: Number(toNumberForm.capTargetMinutes),
      deloadEveryNWeeks: Number(toNumberForm.deloadEveryNWeeks),
      deloadMultiplier: Number(toNumberForm.deloadMultiplier),
      weekProgressionMultiplier: Number(toNumberForm.weekProgressionMultiplier),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    const toNumber = castFormToNumber(form);
    try {
      await createProgressionStrategy({
        ...toNumber,
        capTargetSeconds: toNumber.capTargetMinutes * 60,
      });
      router.push("/");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  const weeksToHitTarget = weeksToReachStrategySeconds(
    lastWeekSumActiveSeconds,
    {
      capTargetSeconds: Number(form.capTargetMinutes) * 60,
      deloadEveryNWeeks: Number(form.deloadEveryNWeeks),
      deloadMultiplier: Number(form.deloadMultiplier),
      weekProgressionMultiplier: Number(form.weekProgressionMultiplier),
    }
  );

  // TODO: should probably adjust this based on time to hit... just go a few weeks beyond
  const sampleSpreadFor20Weeks = [
    ...Array(
      Number.isFinite(weeksToHitTarget) ? weeksToHitTarget + 5 : 5
    ).keys(),
  ].map((i) =>
    Math.round(
      activeSecondsAtWeek({
        partialStrategy: {
          capTargetSeconds: Number(form.capTargetMinutes) * 60,
          deloadEveryNWeeks: Number(form.deloadEveryNWeeks),
          deloadMultiplier: Number(form.deloadMultiplier),
          weekProgressionMultiplier: Number(form.weekProgressionMultiplier),
        },
        startSeconds: lastWeekSumActiveSeconds,
        weekSinceStart: i,
      }) / 60
    )
  );

  return (
    <div className="flex flex-col sm:grid grid-cols-2 gap-5 w-full sm:max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow ">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p>
          Last week you ran{" "}
          <span className="font-semibold">
            {Math.round(lastWeekSumActiveSeconds / 60)} minutes
          </span>
          . How do you want to progress from there?
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">
            Every week, multiply total minutes by
          </label>
          <Input
            type="number"
            step="0.01"
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
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </form>
      <div>
        <p>
          It will take{" "}
          <span className="font-semibold">{weeksToHitTarget} weeks</span> to
          reach your goal of {form.capTargetMinutes} minutes a week, or{" "}
          {Math.round(Number(form.capTargetMinutes) / 60)} hours.
        </p>
        <Chart>
          <Series
            type="line"
            data={sampleSpreadFor20Weeks}
            options={{ name: "Active Minutes" }}
          />
        </Chart>
      </div>
    </div>
  );
}

function weeksToReachStrategySeconds(
  baselineActiveSeconds: number,
  partialStrategy: Omit<ProgressionStrategyInsert, "anchorDate" | "name">
) {
  const {
    deloadEveryNWeeks: k,
    deloadMultiplier: d,
    weekProgressionMultiplier: m,
    capTargetSeconds: target,
  } = partialStrategy;

  // invalid / degenerate
  if (target == null || !m || m < 1 || baselineActiveSeconds <= 0) {
    return Infinity;
  }

  if (baselineActiveSeconds >= target) return 0;

  return Math.ceil(Math.log(target / baselineActiveSeconds) / Math.log(m));
}

function activeSecondsAtWeek(args: {
  weekSinceStart: number;
  partialStrategy: Omit<ProgressionStrategyInsert, "anchorDate" | "name">;
  startSeconds: number;
}) {
  const {
    deloadEveryNWeeks,
    deloadMultiplier,
    weekProgressionMultiplier,
    capTargetSeconds,
  } = args.partialStrategy;
  const startSeconds = args.startSeconds;
  const weeksSinceStart = args.weekSinceStart;

  if (
    capTargetSeconds == null ||
    !weekProgressionMultiplier ||
    weekProgressionMultiplier < 1 ||
    startSeconds <= 0 ||
    weeksSinceStart < 0
  ) {
    return 0;
  }

  function isDeloadWeek(week: number, k: number | null | undefined) {
    return !!k && k > 0 && week > 0 && week % k === 0;
  }

  const base = startSeconds * weekProgressionMultiplier ** weeksSinceStart;

  const deloaded = isDeloadWeek(weeksSinceStart, deloadEveryNWeeks);
  if (base >= capTargetSeconds) {
    if (deloaded && deloadMultiplier) {
      return Math.max(0, capTargetSeconds * deloadMultiplier);
    }
    return capTargetSeconds;
  }

  if (deloaded && deloadMultiplier != null) {
    return Math.max(0, base * deloadMultiplier);
  }

  return base;
}
