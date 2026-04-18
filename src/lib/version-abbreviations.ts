const LEGACY_TO_CANONICAL_ABBREVIATION: Record<string, string> = {
  "American Standard Version (1901)": "ASV",
  "English Berean Standard Bible": "BSB",
  "Majority Standard BIble": "MSB",
  "Open English Bible (US)": "OEB",
  "Open English Bible (Commonwealth)": "OEB-CW",
  "World English Bible Updated": "WEBU",
};

const CANONICAL_TO_LEGACY_ABBREVIATIONS = Object.entries(
  LEGACY_TO_CANONICAL_ABBREVIATION
).reduce<Record<string, string[]>>((acc, [legacy, canonical]) => {
  const existing = acc[canonical] ?? [];
  existing.push(legacy);
  acc[canonical] = existing;
  return acc;
}, {});

export function canonicalizeVersionAbbreviation(abbreviation: string): string {
  return LEGACY_TO_CANONICAL_ABBREVIATION[abbreviation] ?? abbreviation;
}

export function getVersionAbbreviationCandidates(abbreviation: string): string[] {
  const canonical = canonicalizeVersionAbbreviation(abbreviation);
  const legacy = CANONICAL_TO_LEGACY_ABBREVIATIONS[canonical] ?? [];
  return Array.from(new Set([canonical, ...legacy]));
}
