import { defineConfig } from 'astro/config';
// Served from GitHub Pages under /freemealsonwheels-web for review; switch base to '/' on the real domain.
const base = process.env.SITE_BASE ?? '/';
// The site used to live at /hearth; keep those shared links working. Astro prefixes the base to each source path
// itself but not to the destination, so the destination carries the base here.
const to = (path) => base.replace(/\/$/, '') + path;
const redirects = {
  '/hearth': to('/'),
  '/hearth/about': to('/about'),
  '/hearth/volunteer': to('/volunteer'),
  '/hearth/get-a-meal': to('/get-a-meal'),
  '/hearth/donate': to('/donate'),
  '/hearth/contact': to('/contact'),
  '/hearth/my-shifts': to('/my-shifts'),
  '/hearth/admin': to('/admin'),
};
export default defineConfig({ site: 'https://ergophobian.github.io', base, redirects });
