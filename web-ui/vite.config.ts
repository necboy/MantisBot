import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 在 configure 之后才注册自己的 proxy.on('error', ...) 处理器
// 所以无法用 removeAllListeners 提前移除——需要在 configure 中替换 proxy.on，
// 让 Vite 注册的处理器在执行前先过滤掉 ECONNREFUSED（后端未就绪的正常情况）
function suppressECONNREFUSED() {
  return {
    configure: (proxy: any) => {
      const _on = proxy.on.bind(proxy);
      proxy.on = (event: string, handler: (...args: any[]) => void) => {
        if (event === 'error') {
          return _on(event, (err: NodeJS.ErrnoException, ...rest: any[]) => {
            if (err.code === 'ECONNREFUSED') return; // 后端启动中，静默忽略
            handler(err, ...rest);
          });
        }
        return _on(event, handler);
      };
    }
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8118',
        changeOrigin: true,
        ...suppressECONNREFUSED()
      },
      '/health': {
        target: 'http://localhost:8118',
        changeOrigin: true,
        ...suppressECONNREFUSED()
      },
      '/ws': {
        target: 'ws://localhost:8118',
        ws: true,
        ...suppressECONNREFUSED()
      },
      '/office-preview': {
        target: 'http://localhost:8118',
        changeOrigin: true,
        ...suppressECONNREFUSED()
      }
    }
  }
});
