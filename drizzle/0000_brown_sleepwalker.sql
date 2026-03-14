CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"book_code" varchar(6) NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" smallint NOT NULL,
	"chapter_count" smallint NOT NULL,
	"testament" varchar(2) NOT NULL,
	CONSTRAINT "books_version_book_code" UNIQUE("version_id","book_code")
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"verse_count" smallint NOT NULL,
	CONSTRAINT "chapters_book_number" UNIQUE("book_id","number")
);
--> statement-breakpoint
CREATE TABLE "daily_verses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_of_year" smallint NOT NULL,
	"reference" varchar(100) NOT NULL,
	"text" text NOT NULL,
	"version_abbreviation" varchar(20) NOT NULL,
	CONSTRAINT "daily_verses_day_of_year_unique" UNIQUE("day_of_year")
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(3) NOT NULL,
	"name" varchar(100) NOT NULL,
	"native_name" varchar(100),
	"script" varchar(50),
	"direction" varchar(3) DEFAULT 'ltr' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "languages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "verses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chapter_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "verses_chapter_number" UNIQUE("chapter_id","number")
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"abbreviation" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"license" varchar(100),
	"source_url" varchar(500),
	"canon_type" varchar(30) DEFAULT 'protestant' NOT NULL,
	"verse_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "versions_abbreviation_unique" UNIQUE("abbreviation")
);
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verses" ADD CONSTRAINT "verses_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;