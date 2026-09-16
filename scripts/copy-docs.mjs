import { cp, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Copy the built Astro docs into public/docs so the Worker serves them
// alongside the dashboard. Runs after both vite build and astro build.
const src = new URL('../docs/dist', import.meta.url);
const dest = new URL('../public/docs', import.meta.url);

await mkdir(dirname(dest.pathname), { recursive: true });
await cp(src.pathname, dest.pathname, { recursive: true });
console.log('Copied docs/dist -> public/docs');
