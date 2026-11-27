import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 生产构建部署在主站子路径 /academic/ 下；开发环境仍用根路径。
export default defineConfig(({ mode }) => ({
    base: mode === 'production' ? '/academic/' : '/',
    plugins: [react()],
    resolve: {
        alias: {
            '@': new URL('./src', import.meta.url).pathname,
        },
    },
    build: {
        outDir: 'dist',
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
            '/academic/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/academic/, ''),
            },
        },
    },
}));
