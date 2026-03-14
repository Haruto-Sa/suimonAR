import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/sumionAR/',
  server: {
    host: true,
    port: 8000,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    cors: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        'marker-ar': 'marker-ar.html',
        'location-ar': 'location-ar.html',
        'location-ar-check': 'location-ar-check.html',
        'location-ar-demo': 'location-ar-demo.html',
        'location-ar-prod': 'location-ar-prod.html',
        'heiRiver-ar': 'heiRiver-ar.html',
        'marker-print': 'marker-print.html',
        matterport: 'matterport.html',
      }
    }
  }
});
