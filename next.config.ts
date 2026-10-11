import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: false,
  serverExternalPackages: [
    "@google-cloud/firestore",
    "google-auth-library",
    "@opentelemetry/api",
    "@opentelemetry/exporter-trace-otlp-proto",
    "@opentelemetry/sdk-trace-base",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
