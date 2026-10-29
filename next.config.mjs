/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting is run explicitly via `npm run lint` in CI and locally.
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // The core engine modules use explicit `.js` extensions in their import
    // specifiers (ESM style). Resolve those to the matching `.ts`/`.tsx`
    // sources so Next.js/webpack can build them without rewriting the core.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
