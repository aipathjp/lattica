/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Lattica packages are workspace-linked; transpile them so Next/SWC
  // handles their ESM `.js` import specifiers consistently in dev and build.
  transpilePackages: [
    '@ai-path/lattica-core',
    '@ai-path/lattica-data',
    '@ai-path/lattica-formula',
    '@ai-path/lattica-react',
    '@ai-path/lattica-io',
    '@ai-path/lattica-collab',
    '@ai-path/lattica-ai',
  ],
};

export default nextConfig;
