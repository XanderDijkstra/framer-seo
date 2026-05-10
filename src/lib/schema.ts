import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const companyProfile = pgTable("company_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull().default(""),
  services: text("services").array().notNull().default(sql`'{}'::text[]`),
  cpvCodes: text("cpv_codes").array().notNull().default(sql`'{}'::text[]`),
  coreCpvPrefixes: text("core_cpv_prefixes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  searchKeywords: text("search_keywords").notNull().default(""),
  boostKeywords: text("boost_keywords")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  penaltyKeywords: text("penalty_keywords")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  preferredRegions: text("preferred_regions")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  cannotDeliver: text("cannot_deliver")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  strengths: text("strengths").array().notNull().default(sql`'{}'::text[]`),
  budgetMin: integer("budget_min").notNull().default(0),
  budgetMax: integer("budget_max").notNull().default(0),
  teamSize: integer("team_size").notNull().default(1),
  pipelineSchedule: text("pipeline_schedule", {
    enum: ["daily", "weekly"],
  })
    .notNull()
    .default("daily"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notices = pgTable(
  "notices",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    buyer: text("buyer"),
    buyerLocation: text("buyer_location"),
    estimatedValue: real("estimated_value"),
    currency: text("currency").default("NOK"),
    deadline: text("deadline"),
    cpvCodes: jsonb("cpv_codes").$type<string[]>().default([]),
    noticeType: text("notice_type"),
    url: text("url"),
    rawJson: jsonb("raw_json"),
    favorited: boolean("favorited").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    fetchedAtIdx: uniqueIndex("notices_fetched_at_id_idx").on(
      t.fetchedAt,
      t.id,
    ),
  }),
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noticeId: text("notice_id")
      .notNull()
      .references(() => notices.id, { onDelete: "cascade" }),
    relevance: real("relevance"),
    sizeFit: real("size_fit"),
    winProbability: real("win_probability"),
    geographyFit: real("geography_fit"),
    deadlineComfort: real("deadline_comfort"),
    composite: real("composite"),
    category: text("category"),
    summaryNo: text("summary_no"),
    reasonsToBid: jsonb("reasons_to_bid").$type<string[]>().default([]),
    redFlags: jsonb("red_flags").$type<string[]>().default([]),
    recommendedAction: text("recommended_action", {
      enum: ["BID", "REVIEW", "SKIP"],
    }),
    scoredAt: timestamp("scored_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    noticeIdx: uniqueIndex("scores_notice_idx").on(t.noticeId),
  }),
);

export type CompanyProfile = typeof companyProfile.$inferSelect;
export type NewCompanyProfile = typeof companyProfile.$inferInsert;
export type Notice = typeof notices.$inferSelect;
export type NewNotice = typeof notices.$inferInsert;
export type Score = typeof scores.$inferSelect;
export type NewScore = typeof scores.$inferInsert;
