import { defineConfig } from 'vitepress';

/**
 * VitePress site config for Taible's documentation.
 *
 * srcDir defaults to `docs/`, so the existing top-level docs (USAGE, PERFORMANCE,
 * ARCHITECTURE, WORKPLAN, PROGRESS, RESEARCH) resolve directly. The eight package
 * READMEs live outside `docs/` (under `packages/*/README.md`), so they are surfaced
 * through thin wrapper pages in `docs/packages/` that summarize and link to each
 * source README — VitePress only resolves links to files inside srcDir, so the
 * wrappers keep the sidebar self-contained while pointing at the canonical source.
 */
export default defineConfig({
  title: 'Taible',
  description:
    'High-performance, framework-agnostic data grid & spreadsheet engine for React / Next.js — clean-room, zero-copyleft, MIT.',
  lastUpdated: true,
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Usage', link: '/USAGE' },
      { text: 'Architecture', link: '/ARCHITECTURE' },
      { text: 'Performance', link: '/PERFORMANCE' },
      {
        text: 'Packages',
        items: [
          { text: '@ai-path/tb-core', link: '/packages/core' },
          { text: '@ai-path/tb-formula', link: '/packages/formula' },
          { text: '@ai-path/tb-react', link: '/packages/react' },
          { text: '@ai-path/tb-io', link: '/packages/io' },
          { text: '@ai-path/tb-data', link: '/packages/data' },
          { text: '@ai-path/tb-collab', link: '/packages/collab' },
          { text: '@ai-path/tb-ai', link: '/packages/ai' },
          { text: '@ai-path/tb-mcp', link: '/packages/mcp' },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Usage', link: '/USAGE' },
          { text: 'Performance', link: '/PERFORMANCE' },
        ],
      },
      {
        text: 'Internals',
        items: [
          { text: 'Architecture', link: '/ARCHITECTURE' },
          { text: 'Research', link: '/RESEARCH' },
          { text: 'Progress', link: '/PROGRESS' },
        ],
      },
      {
        text: 'Packages',
        items: [
          { text: '@ai-path/tb-core', link: '/packages/core' },
          { text: '@ai-path/tb-formula', link: '/packages/formula' },
          { text: '@ai-path/tb-react', link: '/packages/react' },
          { text: '@ai-path/tb-io', link: '/packages/io' },
          { text: '@ai-path/tb-data', link: '/packages/data' },
          { text: '@ai-path/tb-collab', link: '/packages/collab' },
          { text: '@ai-path/tb-ai', link: '/packages/ai' },
          { text: '@ai-path/tb-mcp', link: '/packages/mcp' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/aipathjp/taible' }],
  },
});
