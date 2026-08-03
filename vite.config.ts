import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'assets',
  test: {
    include: ['test/**/*.test.ts'],
  },
});
