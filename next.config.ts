import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Ontwikkelknop rechtsonder, zodat hij niet over de zijbalk valt.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  // Bonnen en bankbestanden tot 25 MB (de acties controleren zelf type en grootte). Let op: Vercel zelf neemt
  // maximaal 4,5 MB per verzoek aan; foto's worden daarom in de browser eerst verkleind (BonUpload).
  experimental: { serverActions: { bodySizeLimit: "26mb" }, proxyClientMaxBodySize: "26mb" },
  poweredByHeader: false,
  async headers() {
    const veilig = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [{ source: "/:pad*", headers: veilig }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
