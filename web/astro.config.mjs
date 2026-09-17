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
				'Open-source, self-hosted coding agent. Slack and dashboard to GitHub PR with approval gates.',
			logo: {
				src: './src/assets/logo.svg',
				alt: 'AI Intern Logo',
			},
			favicon: '/favicon.svg',
			customCss: ['./src/styles/theme.css'],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/princepal9120/ai-intern' },
				{ icon: 'x.com', label: 'Twitter / X', href: 'https://x.com/prince_twets' },
			],
			editLink: {
				baseUrl: 'https://github.com/princepal9120/ai-intern/edit/main/docs/',
			},
			sidebar: [
				{
					label: 'Get started',
					items: [
						{ label: 'Overview', slug: 'docs/overview' },
						{ label: 'Quickstart', slug: 'docs/getting-started' },
						{ label: 'Architecture', slug: 'docs/architecture' },
						{ label: 'Models & pricing', slug: 'docs/costs' },
					],
				},
				{
					label: 'Core Concepts',
					items: [
						{ label: 'Approval Gates', slug: 'docs/approval-gates' },
						{ label: 'Claude Code & OpenCode', slug: 'docs/claude-code' },
						{ label: 'Cloudflare Sandbox', slug: 'docs/security' },
					],
				},
				{
					label: 'Integrations',
					items: [
						{ label: 'Slack Integration', slug: 'docs/slack' },
						{ label: 'GitHub Pull Requests', slug: 'docs/github' },
						{ label: 'Automations & Cron', slug: 'docs/automations' },
					],
				},
				{
					label: 'Operations & Dashboard',
					items: [
						{ label: 'Tasks & Runs Dashboard', slug: 'docs/dashboard' },
						{ label: 'Configuration & Secrets', slug: 'docs/configuration' },
						{ label: 'Local development', slug: 'docs/local-development' },
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
