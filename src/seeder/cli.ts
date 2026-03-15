import { Command } from "commander";
import { downloadAndParseEbible } from "./sources/ebible.js";
import { seedVersion } from "./bulk-insert.js";
import { db, queryClient } from "../db/client.js";
import { languages, versions } from "../db/schema.js";
import { sql, eq } from "drizzle-orm";
import { fetchCatalog, filterByLicense } from "./catalog.js";
import { runBatchImport, createBatchReport } from "./batch-runner.js";

const program = new Command();

program
  .name("open-bible-seed")
  .description("Seed Bible translations into the database")
  .version("1.0.0");

program
  .command("seed")
  .description("Download and seed a Bible translation")
  .requiredOption(
    "-s, --source <source>",
    "Source to download from (currently: ebible)"
  )
  .option(
    "-t, --translation <id>",
    "Translation identifier (e.g. engkjv for eBible.org)"
  )
  .option("-l, --language <code>", "ISO 639-3 language code (e.g. eng)")
  .option("-a, --abbreviation <abbr>", "Version abbreviation (e.g. KJV)")
  .option("-n, --name <name>", "Full version name")
  .option("--license <license>", "License information")
  .option("--lang-name <name>", "Language name in English")
  .option("--lang-native <name>", "Language native name")
  .option("--lang-script <script>", "Language script (e.g. Latin)")
  .option("--lang-direction <dir>", "Text direction: ltr or rtl", "ltr")
  .action(async (opts) => {
    try {
      if (opts.source !== "ebible") {
        console.error(`Unknown source: ${opts.source}. Supported: ebible`);
        process.exit(1);
      }

      if (!opts.translation) {
        console.error("--translation is required for ebible source");
        process.exit(1);
      }

      if (!opts.language) {
        console.error("--language is required");
        process.exit(1);
      }

      if (!opts.abbreviation) {
        console.error("--abbreviation is required");
        process.exit(1);
      }

      if (!opts.name) {
        console.error("--name is required");
        process.exit(1);
      }

      console.log(`Downloading from eBible.org: ${opts.translation}...`);
      const parsedBooks = await downloadAndParseEbible(opts.translation);

      console.log(
        `Downloaded ${parsedBooks.length} books. Seeding into database...`
      );

      await seedVersion({
        parsedBooks,
        languageCode: opts.language,
        languageName: opts.langName ?? opts.language,
        languageNativeName: opts.langNative,
        languageScript: opts.langScript,
        languageDirection: opts.langDirection,
        abbreviation: opts.abbreviation,
        name: opts.name,
        license: opts.license,
        sourceUrl: `https://ebible.org/Scriptures/${opts.translation}_usfm.zip`,
      });

      console.log("Seeding complete!");
    } catch (err) {
      console.error("Seed failed:", err);
      process.exit(1);
    } finally {
      await queryClient.end();
    }
  });

program
  .command("stats")
  .description("Print language and version counts")
  .action(async () => {
    try {
      const [langResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(languages);
      const [versionResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(versions);

      console.log(`Languages: ${langResult.count}`);
      console.log(`Versions:  ${versionResult.count}`);
    } catch (err) {
      console.error("Stats failed:", err);
      process.exit(1);
    } finally {
      await queryClient.end();
    }
  });

program
  .command("seed-daily")
  .description("Seed 366 curated daily verses into the database")
  .action(async () => {
    try {
      const { seedDailyVerses } = await import("./daily-verses-seed.js");
      await seedDailyVerses();
      console.log("Daily verses seeding complete!");
    } catch (err) {
      console.error("Daily verses seed failed:", err);
      process.exit(1);
    } finally {
      await queryClient.end();
    }
  });

program
  .command("discover")
  .description("Fetch eBible.org catalog and show eligible translations")
  .action(async () => {
    try {
      console.log("Fetching eBible.org catalog...");
      const all = await fetchCatalog();
      const eligible = filterByLicense(all);

      // Breakdown by license type
      const byLicense = new Map<string, number>();
      for (const entry of eligible) {
        byLicense.set(entry.licenseType, (byLicense.get(entry.licenseType) ?? 0) + 1);
      }

      // Breakdown by language
      const byLanguage = new Map<string, number>();
      for (const entry of eligible) {
        byLanguage.set(entry.languageCode, (byLanguage.get(entry.languageCode) ?? 0) + 1);
      }

      console.log(`\nTotal in catalog: ${all.length}`);
      console.log(`Eligible (open license): ${eligible.length}`);
      console.log(`\nBy license type:`);
      for (const [license, count] of Array.from(byLicense.entries()).sort()) {
        console.log(`  ${license}: ${count}`);
      }
      console.log(`\nUnique languages: ${byLanguage.size}`);
    } catch (err) {
      console.error("Discover failed:", err);
      process.exit(1);
    }
  });

program
  .command("seed-all")
  .description("Import all eligible eBible.org translations")
  .option("-c, --concurrency <n>", "Max concurrent imports", "1")
  .option("-d, --delay <ms>", "Delay between imports in ms", "1000")
  .action(async (opts) => {
    try {
      console.log("Fetching eBible.org catalog...");
      const all = await fetchCatalog();
      const eligible = filterByLicense(all);

      console.log(`Found ${eligible.length} eligible translations. Starting import...`);

      const results = await runBatchImport(eligible, {
        concurrency: parseInt(opts.concurrency, 10),
        delay: parseInt(opts.delay, 10),
        onProgress: (result, index, total) => {
          const pct = Math.round(((index + 1) / total) * 100);
          console.log(
            `[${pct}%] ${result.translationId}: ${result.status}${result.verseCount ? ` (${result.verseCount} verses)` : ""}${result.reason ? ` — ${result.reason}` : ""}${result.error ? ` — ${result.error}` : ""}`
          );
        },
      });

      const report = createBatchReport(results);
      console.log(`\nBatch import complete:`);
      console.log(`  Total:    ${report.total}`);
      console.log(`  Imported: ${report.imported}`);
      console.log(`  Skipped:  ${report.skipped}`);
      console.log(`  Failed:   ${report.failed}`);

      if (report.failures.length > 0) {
        console.log(`\nFailures:`);
        for (const f of report.failures) {
          console.log(`  ${f.translationId}: ${f.error}`);
        }
      }
    } catch (err) {
      console.error("Seed-all failed:", err);
      process.exit(1);
    } finally {
      await queryClient.end();
    }
  });

program
  .command("seed-language <code>")
  .description("Import all eligible translations for a language code (e.g. eng)")
  .option("-c, --concurrency <n>", "Max concurrent imports", "1")
  .option("-d, --delay <ms>", "Delay between imports in ms", "1000")
  .action(async (code, opts) => {
    try {
      console.log(`Fetching eBible.org catalog for language: ${code}...`);
      const all = await fetchCatalog();
      const eligible = filterByLicense(all).filter(
        (e) => e.languageCode === code
      );

      if (eligible.length === 0) {
        console.log(`No eligible translations found for language code "${code}".`);
        return;
      }

      console.log(`Found ${eligible.length} eligible translations for "${code}". Starting import...`);

      const results = await runBatchImport(eligible, {
        concurrency: parseInt(opts.concurrency, 10),
        delay: parseInt(opts.delay, 10),
        onProgress: (result, index, total) => {
          const pct = Math.round(((index + 1) / total) * 100);
          console.log(
            `[${pct}%] ${result.translationId}: ${result.status}${result.verseCount ? ` (${result.verseCount} verses)` : ""}${result.reason ? ` — ${result.reason}` : ""}${result.error ? ` — ${result.error}` : ""}`
          );
        },
      });

      const report = createBatchReport(results);
      console.log(`\nImport complete:`);
      console.log(`  Total:    ${report.total}`);
      console.log(`  Imported: ${report.imported}`);
      console.log(`  Skipped:  ${report.skipped}`);
      console.log(`  Failed:   ${report.failed}`);

      if (report.failures.length > 0) {
        console.log(`\nFailures:`);
        for (const f of report.failures) {
          console.log(`  ${f.translationId}: ${f.error}`);
        }
      }
    } catch (err) {
      console.error("Seed-language failed:", err);
      process.exit(1);
    } finally {
      await queryClient.end();
    }
  });

program
  .command("seed-translation <id>")
  .description("Import a specific translation by eBible.org ID (e.g. engkjv)")
  .option("--force", "Re-import even if already exists")
  .action(async (id, opts) => {
    try {
      console.log(`Fetching eBible.org catalog...`);
      const all = await fetchCatalog();
      const eligible = filterByLicense(all);
      const entry = eligible.find((e) => e.translationId === id);

      if (!entry) {
        // Check if it exists but is not eligible
        const inCatalog = all.find((e) => e.translationId === id);
        if (inCatalog) {
          console.error(
            `Translation "${id}" exists but has a non-open license (${inCatalog.licenseType}). Cannot import.`
          );
        } else {
          console.error(`Translation "${id}" not found in eBible.org catalog.`);
        }
        process.exit(1);
      }

      console.log(`Importing ${entry.name} (${entry.abbreviation})...`);

      const results = await runBatchImport([entry], {
        force: opts.force,
      });

      const result = results[0];
      if (result.status === "imported") {
        console.log(`Imported ${entry.abbreviation}: ${result.verseCount} verses`);
      } else if (result.status === "skipped") {
        console.log(`Skipped: ${result.reason}. Use --force to re-import.`);
      } else {
        console.error(`Failed: ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      console.error("Seed-translation failed:", err);
      process.exit(1);
    } finally {
      await queryClient.end();
    }
  });

program
  .command("status")
  .description("Show imported vs available translation counts")
  .action(async () => {
    try {
      // Get imported count from DB
      const [versionResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(versions);
      const importedCount = versionResult.count;

      // Get available count from catalog
      console.log("Fetching eBible.org catalog...");
      const all = await fetchCatalog();
      const eligible = filterByLicense(all);

      console.log(`\nDatabase status:`);
      console.log(`  Imported versions: ${importedCount}`);
      console.log(`  Available (eligible): ${eligible.length}`);
      console.log(`  Remaining: ${Math.max(0, eligible.length - importedCount)}`);
    } catch (err) {
      console.error("Status failed:", err);
      process.exit(1);
    } finally {
      await queryClient.end();
    }
  });

program.parse();
