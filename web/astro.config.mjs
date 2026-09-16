// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Static site built to public/ by Astro (see scripts/copy-docs.mjs).
// Static output is Astro's default; no adapter, no SSR.
export default defineConfig({
	srcDir: './src',
	outDir: 'dist',
	output: 'static',
	integrations: [
		starlight({
			title: 'AI Intern',
			description:
				'Self-hosted coding agent on Cloudflare: approval-gated tasks delegated to isolated sandbox containers running OpenCode.',
			sidebar: [
				{ label: 'Overview', slug: 'docs/overview' },
				{ label: 'Getting started', slug: 'docs/getting-started' },
				{ label: 'Configuration', slug: 'docs/configuration' },
				{ label: 'Local development', slug: 'docs/local-development' },
				{ label: 'Dashboard', slug: 'docs/dashboard' },
				{ label: 'Deployment', slug: 'docs/deployment' },
				{ label: 'GitHub', slug: 'docs/github' },
				{ label: 'Security', slug: 'docs/security' },
				{ label: 'Architecture', slug: 'docs/architecture' },
				{ label: 'Troubleshooting', slug: 'docs/troubleshooting' },
				{ label: 'Costs', slug: 'docs/costs' },
				{ label: 'Contributing', slug: 'docs/contributing' },
				{ label: 'API reference', slug: 'docs/api' },
				{ label: 'Readiness checklist', slug: 'docs/readiness' },
			],
			}),
	],
});
