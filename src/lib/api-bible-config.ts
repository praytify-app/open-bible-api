// src/lib/api-bible-config.ts

export const API_BIBLE_VERSIONS: Record<
  string,
  { bibleId: string; name: string; language: string; languageCode: string }
> = {
  ESV: {
    bibleId: "01b29f4b342acc35-01",
    name: "English Standard Version",
    language: "English",
    languageCode: "eng",
  },
  NIV: {
    bibleId: "78a9f6124f344018-01",
    name: "New International Version",
    language: "English",
    languageCode: "eng",
  },
  NLT: {
    bibleId: "c315fa9f71d4af3a-01",
    name: "New Living Translation",
    language: "English",
    languageCode: "eng",
  },
  NASB: {
    bibleId: "59fd5ef25d947b14-01",
    name: "New American Standard Bible",
    language: "English",
    languageCode: "eng",
  },
  NKJV: {
    bibleId: "de4e12af7f28f599-02",
    name: "New King James Version",
    language: "English",
    languageCode: "eng",
  },
};

export function isApiBibleVersion(abbreviation: string): boolean {
  return abbreviation in API_BIBLE_VERSIONS;
}
