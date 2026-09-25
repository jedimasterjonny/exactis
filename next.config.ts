import type { NextConfig } from "next";

// Only directives that bite on a statically generated page. script-src and
// style-src are deliberately absent: Next emits five inline bootstrap scripts
// per document, and without a nonce or a hash for each one, `script-src 'self'`
// blocks them and hydration dies with React error #412. A nonce cannot be the
// answer either - the shipped content-security-policy guide states a nonce must
// be regenerated per view, which forces every page dynamic and rules out PPR.
// What is left still closes off base-tag injection, form exfiltration, plugin
// embedding and clickjacking, and none of it needs a request to be served.
//
// upgrade-insecure-requests is deliberately absent as well. WebKit applies it
// on http://localhost where the spec exempts it (bugs.webkit.org 250776), so
// every subresource of a dev or next start page is rewritten to https, nothing
// answers, and fonts and chunks fail silently. Headers are baked at build
// time, so a phase check could not spare next start. What the directive
// guarded, an http reference in our own markup on an https page, every current
// browser blocks or upgrades as mixed content, and HSTS covers navigations.
const contentSecurityPolicy = [
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // So a phone on the home network can use the dev server. next dev already
  // listens on every interface, but it serves its chunks and the HMR socket
  // only to a page loaded from localhost, so a page opened at a LAN address
  // renders and never hydrates: each chunk comes back 403. Matched against
  // the hostname of the request's Origin, and `*` is exactly one label, so
  // this admits the one /24 and nothing wider. next start never reads it.
  allowedDevOrigins: ["192.168.1.*"],
  // Top-level and stable-named in 16: it absorbed the removed `ppr`,
  // `dynamicIO` and `useCache` flags, and `experimental.cacheComponents` is a
  // deprecated alias for it. Off by default, and turning it on is not a
  // rename - data read outside a `<Suspense>` boundary and not marked
  // `use cache` becomes a build error rather than a route quietly going
  // dynamic.
  cacheComponents: true,
  experimental: {
    // On by default, and stated because .mcp.json depends on it: the
    // next-devtools server configured there is a client of the /_next/mcp
    // endpoint this enables, and switching it off leaves that server with
    // nothing to find.
    mcpServer: true,
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
          // preload is deliberately absent. It asks browsers to hardcode the
          // domain and every subdomain as HTTPS-only before a request is ever
          // made, and leaving that list takes months, so it is the one value
          // here that cannot be taken back. Add it when the domain is chosen
          // and submitted at hstspreload.org, not before.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
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
