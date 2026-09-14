import type { NextConfig } from "next";

// Only directives that bite on a statically generated page. script-src and
// style-src are deliberately absent: Next emits five inline bootstrap scripts
// per document, and without a nonce or a hash for each one, `script-src 'self'`
// blocks them and hydration dies with React error #412. A nonce cannot be the
// answer either - the shipped content-security-policy guide states a nonce must
// be regenerated per view, which forces every page dynamic and rules out PPR.
// What is left still closes off base-tag injection, form exfiltration, plugin
// embedding and clickjacking, and none of it needs a request to be served.
const contentSecurityPolicy = [
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    // Emits integrity="sha512-..." on every external chunk, which the browser
    // verifies independently of any CSP. Does not hash the inline scripts, so
    // it does not unlock a strict script-src.
    sri: { algorithm: "sha512" },
    // Type-checks props and return values of route files. Undocumented: no
    // page in the shipped docs, only JSDoc in config-shared.d.ts.
    strictRouteTypes: true,
  },
  headers(): Awaited<ReturnType<NonNullable<NextConfig["headers"]>>> {
    return [
      {
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
        source: "/:path*",
      },
    ];
  },
  logging: {
    // An agent working here reads the terminal and cannot open a browser
    // console, so forwarding is worth more than it would be to a human.
    browserToTerminal: true,
    fetches: { fullUrl: true, hmrRefreshes: true },
  },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactCompiler: {
    compilationMode: "infer",
    // Default is "none", which silently skips any component the compiler
    // cannot handle.
    panicThreshold: "critical_errors",
  },
  reactStrictMode: true,
  trailingSlash: false,
  typedRoutes: true,
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
