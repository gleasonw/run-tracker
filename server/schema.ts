import { InferSelectModel } from "drizzle-orm";
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

export const sessionTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    secret_hash: text("secret_hash").notNull(),
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

export type Session = InferSelectModel<typeof sessionTable>;
