import { describe, it, expect } from "vitest";
import { languages, versions, books, chapters, verses, dailyVerses } from "../../src/db/schema.js";

describe("Database Schema", () => {
  describe("languages table", () => {
    it("should have all required columns", () => {
      expect(languages.id).toBeDefined();
      expect(languages.code).toBeDefined();
      expect(languages.name).toBeDefined();
      expect(languages.nativeName).toBeDefined();
      expect(languages.script).toBeDefined();
      expect(languages.direction).toBeDefined();
      expect(languages.createdAt).toBeDefined();
    });
  });

  describe("versions table", () => {
    it("should have all required columns", () => {
      expect(versions.id).toBeDefined();
      expect(versions.languageId).toBeDefined();
      expect(versions.abbreviation).toBeDefined();
      expect(versions.name).toBeDefined();
      expect(versions.description).toBeDefined();
      expect(versions.license).toBeDefined();
      expect(versions.sourceUrl).toBeDefined();
      expect(versions.canonType).toBeDefined();
      expect(versions.verseCount).toBeDefined();
      expect(versions.attribution).toBeDefined();
      expect(versions.attributionUrl).toBeDefined();
      expect(versions.licenseType).toBeDefined();
      expect(versions.hasAudio).toBeDefined();
      expect(versions.createdAt).toBeDefined();
    });
  });

  describe("books table", () => {
    it("should have all required columns", () => {
      expect(books.id).toBeDefined();
      expect(books.versionId).toBeDefined();
      expect(books.bookCode).toBeDefined();
      expect(books.name).toBeDefined();
      expect(books.position).toBeDefined();
      expect(books.chapterCount).toBeDefined();
      expect(books.testament).toBeDefined();
    });
  });

  describe("chapters table", () => {
    it("should have all required columns", () => {
      expect(chapters.id).toBeDefined();
      expect(chapters.bookId).toBeDefined();
      expect(chapters.number).toBeDefined();
      expect(chapters.verseCount).toBeDefined();
    });
  });

  describe("verses table", () => {
    it("should have all required columns", () => {
      expect(verses.id).toBeDefined();
      expect(verses.chapterId).toBeDefined();
      expect(verses.number).toBeDefined();
      expect(verses.text).toBeDefined();
    });
  });

  describe("dailyVerses table", () => {
    it("should have all required columns", () => {
      expect(dailyVerses.id).toBeDefined();
      expect(dailyVerses.dayOfYear).toBeDefined();
      expect(dailyVerses.reference).toBeDefined();
      expect(dailyVerses.text).toBeDefined();
      expect(dailyVerses.versionAbbreviation).toBeDefined();
    });
  });
});
