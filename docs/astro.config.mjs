// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Static docs site served under /docs by the same Worker (see scripts/copy-docs.mjs).
// Static output is Astro's default; no adapter, no SSR.
export default defineConfig({
	srcDir: './src',
	base: '/docs',
	outDir: 'dist',
	output: 'static',
	integrations: [
		starlight({
			title: 'AI Intern',
			description:
				'Self-hosted coding agent on Cloudflare: approval-gated tasks delegated to isolated sandbox containers running OpenCode.',
			sidebar: [
				{ label: 'Overview', slug: 'overview' },
				{ label: 'Getting started', slug: 'getting-started' },
				{ label: 'Configuration', slug: 'configuration' },
				{ label: 'Local development', slug: 'local-development' },
				{ label: 'Dashboard', slug: 'dashboard' },
				{ label: 'Deployment', slug: 'deployment' },
				{ label: 'GitHub', slug: 'github' },
				{ label: 'Security', slug: 'security' },
				{ label: 'Architecture', slug: 'architecture' },
				{ label: 'Troubleshooting', slug: 'troubleshooting' },
				{ label: 'Costs', slug: 'costs' },
				{ label: 'Contributing', slug: 'contributing' },
				{ label: 'API reference', slug: 'api' },
				{ label: 'Readiness checklist', slug: 'readiness' },
			],
			}),
	],
});
