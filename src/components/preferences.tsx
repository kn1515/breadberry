"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Languages, Moon, Sun } from "lucide-react";
import {
  defaultPreferences,
  parsePreferences,
  PREFERENCES_KEY,
  translate,
  type Locale,
  type Theme,
} from "@/lib/i18n";

type Preferences = { locale: Locale; theme: Theme };
type PreferencesContextValue = Preferences & {
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  t: (source: string, values?: (string | number)[]) => string;
};
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function applyPreferences(preferences: Preferences) {
  document.documentElement.lang = preferences.locale;
  document.documentElement.dataset.theme = preferences.theme;
  document.title =
    preferences.locale === "en"
      ? "breadberry — Connect your imagination."
      : "breadberry — 想像を、つなごう。";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  useEffect(() => {
    const sync = () => {
      let next = defaultPreferences;
      try {
        next = parsePreferences(localStorage.getItem(PREFERENCES_KEY));
      } catch {
        /* Storage may be disabled. */
      }
      setPreferences(next);
      applyPreferences(next);
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY || event.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const update = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    applyPreferences(next);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    } catch {
      /* The current session still works without storage. */
    }
  };
  const t = useCallback(
    (source: string, values?: (string | number)[]) =>
      translate(source, preferences.locale, values),
    [preferences.locale],
  );
  return (
    <PreferencesContext.Provider
      value={{
        ...preferences,
        setLocale: (locale) => update({ locale }),
        setTheme: (theme) => update({ theme }),
        t,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("PreferencesProvider is required");
  return context;
}

export function Text({ message }: { message: string }) {
  const { t } = usePreferences();
  return <>{t(message)}</>;
}

export function PreferenceControls() {
  const { locale, theme, setLocale, setTheme } = usePreferences();
  const themeLabel =
    locale === "ja"
      ? theme === "dark"
        ? "ホワイトテーマに切り替え"
        : "ダークテーマに切り替え"
      : theme === "dark"
        ? "Switch to light theme"
        : "Switch to dark theme";
  return (
    <div className="preference-controls">
      <button
        type="button"
        className="preference-button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label={themeLabel}
        title={themeLabel}
      >
        {theme === "dark" ? (
          <Sun size={17} aria-hidden="true" />
        ) : (
          <Moon size={17} aria-hidden="true" />
        )}
        <span>
          {locale === "ja"
            ? theme === "dark"
              ? ""
              : ""
            : theme === "dark"
              ? ""
              : ""}
        </span>
      </button>
      <button
        type="button"
        className="preference-button"
        onClick={() => setLocale(locale === "ja" ? "en" : "ja")}
        aria-label={locale === "ja" ? "Switch to English" : "日本語に切り替え"}
        title={locale === "ja" ? "Switch to English" : "日本語に切り替え"}
      >
        <Languages size={17} aria-hidden="true" />
        <span lang={locale === "ja" ? "en" : "ja"}>
          {locale === "ja" ? "English" : "日本語"}
        </span>
      </button>
    </div>
  );
}
