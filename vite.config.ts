
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 加载当前模式下的环境变量（.env, .env.local 等）
  // Use a type cast to any to satisfy the TypeScript compiler for Node.js process methods in this context.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // 优先读取 .env 文件中的 API_KEY，如果没有则尝试读取系统 process.env
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
    },
    server: {
      port: 3000
    }
  };
});
