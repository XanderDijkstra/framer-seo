CREATE TABLE "company_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"cpv_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"core_cpv_prefixes" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_keywords" text DEFAULT '' NOT NULL,
	"boost_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"penalty_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"preferred_regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"cannot_deliver" text[] DEFAULT '{}'::text[] NOT NULL,
	"strengths" text[] DEFAULT '{}'::text[] NOT NULL,
	"budget_min" integer DEFAULT 0 NOT NULL,
	"budget_max" integer DEFAULT 0 NOT NULL,
	"team_size" integer DEFAULT 1 NOT NULL,
	"pipeline_schedule" text DEFAULT 'daily' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"buyer" text,
	"buyer_location" text,
	"estimated_value" real,
	"currency" text DEFAULT 'NOK',
	"deadline" text,
	"cpv_codes" jsonb DEFAULT '[]'::jsonb,
	"notice_type" text,
	"url" text,
	"raw_json" jsonb,
	"favorited" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" text NOT NULL,
	"relevance" real,
	"size_fit" real,
	"win_probability" real,
	"geography_fit" real,
	"deadline_comfort" real,
	"composite" real,
	"category" text,
	"summary_no" text,
	"reasons_to_bid" jsonb DEFAULT '[]'::jsonb,
	"red_flags" jsonb DEFAULT '[]'::jsonb,
	"recommended_action" text,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notices_fetched_at_id_idx" ON "notices" USING btree ("fetched_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_notice_idx" ON "scores" USING btree ("notice_id");