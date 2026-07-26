import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Personal data guard: events.local.js is bundled ONLY in dev, or in builds
// explicitly marked VITE_DEMO=1. Any other build gets an empty stub, so the
// runtime conditional can never leak calendar data into a shipped bundle.
function localDataGuard(command) {
  const allow = command === 'serve' || process.env.VITE_DEMO === '1';
  return {
    name: 'local-data-guard',
    enforce: 'pre',
    load(id) {
      if (!allow && id.includes('events.local.js')) {
        return 'export const EVENTS = [];';
      }
      return null;
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [localDataGuard(command), react()],
  base: './', // relative asset paths — works on Vercel/Netlify/GitHub Pages subpaths alike
}));
