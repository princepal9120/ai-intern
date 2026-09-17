// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import starlight from '@astrojs/starlight';

// Static site built to public/ by Astro (see scripts/copy-docs.mjs).
// Static output is Astro's default; no adapter, no SSR.
export default defineConfig({
	srcDir: './src',
	outDir: 'dist',
	output: 'static',
	integrations: [
		tailwind(),
		starlight({
			title: 'AI Intern',
			description:
				'Self-hosted coding agent on Cloudflare: approval-gated tasks delegated to isolated sandbox containers running OpenCode.',
			customCss: ['./src/styles/capy-theme.css'],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/princepal9120/ai-intern' },
			],
			sidebar: [
				{
					label: 'Get started',
					items: [
						{ label: 'Overview', slug: 'docs/overview' },
						{ label: 'Quickstart', slug: 'docs/getting-started' },
						{ label: 'Models & pricing', slug: 'docs/costs' },
					],
				},
				{
					label: 'Agent',
					items: [
						{ label: 'Tasks & Runs', slug: 'docs/dashboard' },
						{ label: 'Pull requests', slug: 'docs/github' },
						{ label: 'Reviews', slug: 'docs/review' },
						{ label: 'Automations', slug: 'docs/automations' },
					],
				},
				{
					label: 'Workspace & Sandbox',
					items: [
						{ label: 'Cloudflare Sandbox', slug: 'docs/security' },
						{ label: 'Configuration & Secrets', slug: 'docs/configuration' },
						{ label: 'Local development', slug: 'docs/local-development' },
						{ label: 'Architecture', slug: 'docs/architecture' },
					],
				},
				{
					label: 'Operations & Deployment',
					items: [
						{ label: 'Deployment', slug: 'docs/deployment' },
						{ label: 'Readiness checklist', slug: 'docs/readiness' },
						{ label: 'Troubleshooting', slug: 'docs/troubleshooting' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'API reference', slug: 'docs/api' },
						{ label: 'Contributing', slug: 'docs/contributing' },
					],
				},
			],
			}),
	],
});
