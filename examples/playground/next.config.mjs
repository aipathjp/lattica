/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Lattica packages are workspace-linked; transpile them so Next/SWC
  // handles their ESM `.js` import specifiers consistently in dev and build.
  transpilePackages: [
    '@ai-path/tb-core',
    '@ai-path/tb-data',
    '@ai-path/tb-formula',
    '@ai-path/tb-react',
    '@ai-path/tb-io',
    '@ai-path/tb-collab',
    '@ai-path/tb-ai',
  ],
};

export default nextConfig;
