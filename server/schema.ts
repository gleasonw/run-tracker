import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  jsonb,
  boolean,
  timestamp,
  varchar,
  uuid,
  integer,
  text,
  index,
  uniqueIndex,
  customType,
  doublePrecision,
  bigint,
  pgEnum,
} from "drizzle-orm/pg-core";

export const userTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 256,
    }).notNull(),
    scope: varchar("scope", { length: 512 }),
    refreshTokenEnc: varchar("refresh_token_enc", { length: 4096 }),
    accessTokenEnc: varchar("access_token_enc", { length: 4096 }),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    extra: jsonb("extra"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("oauth_accounts_user_idx").on(t.userId),
    uniqueIndex("oauth_provider_account_unique").on(
      t.provider,
      t.providerAccountId
    ),
  ]
);

export const bytea = customType<{ data: Uint8Array<ArrayBuffer> }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: unknown) {
    return value as Uint8Array<ArrayBuffer>;
  },
  toDriver(value: Uint8Array<ArrayBuffer>) {
    return value;
  },
});

export const sessionTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    secret_hash: bytea("secret_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("sessions_expires_idx").on(t.expiresAt),
    index("sessions_user_idx").on(t.userId),
  ]
);

export const targetEnumSource = pgEnum("target_source", ["manual", "auto"]);

export const weeklyTarget = pgTable("weekly_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => userTable.id, {
    onDelete: "cascade",
  }),
  activeSeconds: integer("active_seconds").notNull(),
  source: targetEnumSource("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const progressionStrategy = pgTable("progression_strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => userTable.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 128 }).notNull(),
  anchorDate: timestamp("anchor_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  weekProgressionMultiplier: doublePrecision("week_progression_multiplier"),
  capTargetSeconds: integer("cap_target_seconds"),
  deloadEveryNWeeks: integer("deload_every_n_weeks"),
  deloadMultiplier: doublePrecision("deload_multiplier"),
  active: boolean("active").default(true).notNull(),
});

export const stravaVisibilityEnum = pgEnum("strava_visibility", [
  "everyone",
  "followers_only",
  "only_me",
]);

export const stravaActivities = pgTable(
  "strava_activities",
  {
    // Local row id (optional but handy)
    id: uuid("id").primaryKey().defaultRandom(),

    // Linkage
    userId: uuid("user_id").notNull(),
    // .references(() => userTable.id, { onDelete: 'cascade' })
    athleteId: bigint("athlete_id", { mode: "number" }).notNull(),

    // Strava identity (global)
    stravaActivityId: bigint("strava_activity_id", { mode: "number" })
      .notNull()
      .unique(),

    // Core metadata
    resourceState: integer("resource_state").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(), // legacy 'Run', etc.
    sportType: varchar("sport_type", { length: 32 }).notNull(), // preferred
    workoutType: integer("workout_type"), // nullable

    // Distances / time / elevation
    distance: doublePrecision("distance").notNull(), // meters
    movingTime: integer("moving_time").notNull(), // seconds
    elapsedTime: integer("elapsed_time"), // seconds
    totalElevationGain: doublePrecision("total_elevation_gain"), // meters

    // Timing
    startDate: timestamp("start_date", { withTimezone: true }).notNull(), // UTC
    startDateLocal: timestamp("start_date_local", {
      withTimezone: false,
    }).notNull(), // local clock time
    timezone: varchar("timezone", { length: 128 }).notNull(), // e.g. "(GMT-08:00) America/Los_Angeles"
    utcOffsetSeconds: integer("utc_offset_seconds").notNull(), // seconds

    // Location (string-ish)
    locationCity: varchar("location_city", { length: 128 }),
    locationState: varchar("location_state", { length: 128 }),
    locationCountry: varchar("location_country", { length: 128 }),

    // Social / counts
    achievementCount: integer("achievement_count"),
    kudosCount: integer("kudos_count"),
    commentCount: integer("comment_count"),
    athleteCount: integer("athlete_count"),
    photoCount: integer("photo_count"),
    prCount: integer("pr_count"),
    totalPhotoCount: integer("total_photo_count"),

    // Map / route
    mapId: text("map_id"),
    summaryPolyline: text("summary_polyline"),

    // Flags
    trainer: boolean("trainer"),
    commute: boolean("commute"),
    manual: boolean("manual"),
    private: boolean("private"),
    visibility: stravaVisibilityEnum("visibility"),
    flagged: boolean("flagged"),
    fromAcceptedTag: boolean("from_accepted_tag"),

    // Gear
    gearId: varchar("gear_id", { length: 32 }),

    // Geo (split for easy querying; switch to PostGIS later if you want)
    startLat: doublePrecision("start_lat"),
    startLng: doublePrecision("start_lng"),
    endLat: doublePrecision("end_lat"),
    endLng: doublePrecision("end_lng"),

    // Performance
    averageSpeed: doublePrecision("average_speed").notNull(), // m/s
    maxSpeed: doublePrecision("max_speed"), // m/s
    averageCadence: doublePrecision("average_cadence"),
    hasHeartrate: boolean("has_heartrate"),
    averageHeartrate: doublePrecision("average_heartrate"),
    maxHeartrate: doublePrecision("max_heartrate"),
    heartrateOptOut: boolean("heartrate_opt_out"),
    displayHideHeartrateOption: boolean(
      "display_hide_heartrate_option"
    ).notNull(),
    elevHigh: doublePrecision("elev_high"),
    elevLow: doublePrecision("elev_low"),
    sufferScore: integer("suffer_score"),

    // Upload / external ids
    uploadId: bigint("upload_id", { mode: "number" }),
    uploadIdStr: varchar("upload_id_str", { length: 32 }),
    externalId: varchar("external_id", { length: 255 }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    byUser: index("strava_activities_by_user").on(table.userId),
    byStartDate: index("strava_activities_by_start_date").on(table.startDate),
    bySportType: index("strava_activities_by_sport").on(table.sportType),
    byGear: index("strava_activities_by_gear").on(table.gearId),
    uniqueByUserAndActivity: uniqueIndex(
      "strava_activities_user_activity_uidx"
    ).on(table.userId, table.stravaActivityId),
  })
);

export type RunTrackerActivity = InferSelectModel<typeof stravaActivities>;
export type Session = InferSelectModel<typeof sessionTable>;
export type User = InferSelectModel<typeof userTable>;
export type WeeklyTargetInsert = InferInsertModel<typeof weeklyTarget>;
export type ProgressionStrategyInsert = InferInsertModel<
  typeof progressionStrategy
>;
