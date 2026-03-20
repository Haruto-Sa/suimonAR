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
        location: 'location.html',
        marker: 'marker.html',
        viewer: 'viewer.html',
        'marker-ar': 'marker-ar.html',
        'marker-print': 'marker-print.html',
        matterport: 'matterport.html',
      }
    }
  }
});
