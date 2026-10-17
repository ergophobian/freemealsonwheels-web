import { defineConfig } from 'astro/config';
// Served from GitHub Pages under /freemealsonwheels-web for review; switch base to '/' on the real domain.
export default defineConfig({ site: 'https://ergophobian.github.io', base: process.env.SITE_BASE ?? '/' });
