ALTER TABLE "daily_verses" ALTER COLUMN "version_abbreviation" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "versions" ALTER COLUMN "abbreviation" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "versions" ALTER COLUMN "license" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "attribution" varchar(500);--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "attribution_url" varchar(500);--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "license_type" varchar(50) DEFAULT 'PD' NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "has_audio" boolean DEFAULT false NOT NULL;