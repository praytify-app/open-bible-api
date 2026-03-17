import {
  pgTable,
  uuid,
  varchar,
  text,
  smallint,
  bigint,
  timestamp,
  unique,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const languages = pgTable("languages", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 3 }).unique().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  nativeName: varchar("native_name", { length: 100 }),
  script: varchar("script", { length: 50 }),
  direction: varchar("direction", { length: 3 }).default("ltr").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const versions = pgTable("versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  languageId: uuid("language_id")
    .references(() => languages.id)
    .notNull(),
  abbreviation: varchar("abbreviation", { length: 100 }).unique().notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  license: text("license"),
  sourceUrl: varchar("source_url", { length: 500 }),
  canonType: varchar("canon_type", { length: 30 }).default("protestant").notNull(),
  verseCount: integer("verse_count").default(0).notNull(),
  attribution: varchar("attribution", { length: 500 }),
  attributionUrl: varchar("attribution_url", { length: 500 }),
  licenseType: varchar("license_type", { length: 50 }).notNull().default("PD"),
  hasAudio: boolean("has_audio").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .references(() => versions.id, { onDelete: "cascade" })
      .notNull(),
    bookCode: varchar("book_code", { length: 6 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    position: smallint("position").notNull(),
    chapterCount: smallint("chapter_count").notNull(),
    testament: varchar("testament", { length: 2 }).notNull(),
  },
  (table) => [unique("books_version_book_code").on(table.versionId, table.bookCode)]
);

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .references(() => books.id, { onDelete: "cascade" })
      .notNull(),
    number: smallint("number").notNull(),
    verseCount: smallint("verse_count").notNull(),
  },
  (table) => [unique("chapters_book_number").on(table.bookId, table.number)]
);

export const verses = pgTable(
  "verses",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    chapterId: uuid("chapter_id")
      .references(() => chapters.id, { onDelete: "cascade" })
      .notNull(),
    number: smallint("number").notNull(),
    text: text("text").notNull(),
  },
  (table) => [unique("verses_chapter_number").on(table.chapterId, table.number)]
);

export const dailyVerses = pgTable("daily_verses", {
  id: uuid("id").primaryKey().defaultRandom(),
  dayOfYear: smallint("day_of_year").unique().notNull(),
  reference: varchar("reference", { length: 100 }).notNull(),
  text: text("text").notNull(),
  versionAbbreviation: varchar("version_abbreviation", { length: 100 }).notNull(),
});
