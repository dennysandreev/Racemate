import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { resolveSentryRelease } from "./sentry-scrub.mjs";

const developmentScriptPolicy = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${developmentScriptPolicy} https://challenges.cloudflare.com`,
      "connect-src 'self' blob: https: wss:",
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const noIndexHeaders = [
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive",
  },
];

const noIndexPaths = [
  "/account/:path*",
  "/admin/:path*",
  "/api/:path*",
  "/auth/:path*",
  "/onboarding/:path*",
  "/predictions/:path*",
  "/s/:path*",
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...noIndexPaths.map((source) => ({
        headers: noIndexHeaders,
        source,
      })),
      {
        source: "/api/og/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, noarchive, max-image-preview:large",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  experimental: {
    cpus: 1,
  },
  output: "standalone",
};

const hasSentrySourceMapUpload = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: {
    name: resolveSentryRelease(),
  },
  silent: !process.env.CI,
  sourcemaps: {
    disable: !hasSentrySourceMapUpload,
  },
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
