import { messages } from "./messages";

export type Locale = "ja" | "en";
export type Theme = "dark" | "light";
export const PREFERENCES_KEY = "breadberry-preferences";
export const defaultPreferences = {
  locale: "ja" as Locale,
  theme: "dark" as Theme,
};

export function parsePreferences(value: string | null) {
  try {
    const data = JSON.parse(value || "null");
    return {
      locale: data?.locale === "en" ? ("en" as const) : ("ja" as const),
      theme: data?.theme === "light" ? ("light" as const) : ("dark" as const),
    };
  } catch {
    return defaultPreferences;
  }
}

const patterns = Object.entries(messages)
  .filter(([key]) => key.includes("{0}"))
  .map(([key, value]) => ({
    pattern: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("([\\s\\S]*?)") +
        "$",
    ),
    value,
  }));

/** Translate only known application messages; never send user content to a translation service. */
export function translate(
  source: string,
  locale: Locale,
  values: (string | number)[] = [],
  depth = 0,
): string {
  let result = source;
  if (locale === "en") {
    result = messages[source] ?? source;
    if (result === source && depth < 4 && /[ぁ-んァ-ヶ一-龠]/.test(source)) {
      for (const { pattern, value } of patterns) {
        const match = pattern.exec(source);
        if (match) {
          result = value.replace(/\{(\d+)\}/g, (_, index) =>
            translate(match[Number(index) + 1], locale, [], depth + 1),
          );
          break;
        }
      }
    }
  }
  return values.length
    ? result.replace(/\{(\d+)\}/g, (token, index) =>
        String(values[Number(index)] ?? token),
      )
    : result;
}
