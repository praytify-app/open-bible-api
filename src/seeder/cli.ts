import { Command } from "commander";
import { downloadAndParseEbible } from "./sources/ebible.js";
import { seedVersion } from "./bulk-insert.js";
import { db, queryClient } from "../db/client.js";
import { languages, versions } from "../db/schema.js";
import { sql } from "drizzle-orm";

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
        sourceUrl: `https://ebible.org/Scriptures/content/${opts.translation}_usfm.zip`,
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
  .description("Seed daily verses (placeholder — will be implemented in Task 24)")
  .action(async () => {
    console.log("seed-daily: Not yet implemented. See Task 24.");
    await queryClient.end();
  });

program.parse();
