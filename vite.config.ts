
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // This shims process.env.API_KEY for the browser environment
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    'process.env': JSON.stringify(process.env),
  },
  server: {
    port: 3000,
    
  }
});
