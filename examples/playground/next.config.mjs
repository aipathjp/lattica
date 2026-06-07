/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Lattica packages are workspace-linked; transpile them so Next/SWC
  // handles their ESM `.js` import specifiers consistently in dev and build.
  transpilePackages: [
    '@lattica/core',
    '@lattica/data',
    '@lattica/formula',
    '@lattica/react',
    '@lattica/io',
    '@lattica/collab',
    '@lattica/ai',
  ],
};

export default nextConfig;
