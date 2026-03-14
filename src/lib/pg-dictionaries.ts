/**
 * Maps ISO 639-3 language codes to PostgreSQL text search dictionary names.
 * Used for building tsvector search indexes during seeding.
 */
export const PG_DICTIONARIES: Record<string, string> = {
  eng: "english",
  fra: "french",
  spa: "spanish",
  por: "portuguese",
  deu: "german",
  ita: "italian",
  nld: "dutch",
  rus: "russian",
  swe: "swedish",
  nor: "norwegian",
  dan: "danish",
  fin: "finnish",
  hun: "hungarian",
  ron: "romanian",
  tur: "turkish",
};

/**
 * Get the PostgreSQL dictionary name for a language code.
 * Falls back to "simple" for unsupported languages.
 */
export function getPgDictionary(languageCode: string): string {
  return PG_DICTIONARIES[languageCode] ?? "simple";
}
