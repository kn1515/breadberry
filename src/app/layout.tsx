import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/500-italic.css";
import "@fontsource/oswald/500.css";
import "./globals.css";
import { PreferencesProvider } from "@/components/preferences";
export const metadata: Metadata = {
  icons: { icon: "/favicon.svg" },
  title: "breadberry — 想像を、つなごう。",
  description:
    "アイデアから回路設計、部品選び、3Dの組み立てガイドまで。あなたのものづくりを支えるAIワークスペース。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const p = JSON.parse(localStorage.getItem("breadberry-preferences") || "null"); document.documentElement.dataset.theme = p?.theme === "light" ? "light" : "dark"; document.documentElement.lang = p?.locale === "en" ? "en" : "ja"; } catch {}`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
