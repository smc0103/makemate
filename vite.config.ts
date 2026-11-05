import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 상대 경로로 빌드해 어느 주소(하위 폴더 포함)에 올려도 동작하게 한다
  base: './',
  worker: {
    // WebLLM 워커는 ES 모듈로 번들 (코드 분할 지원)
    format: 'es',
  },
  build: {
    // WebLLM 런타임은 기기 속 AI를 쓸 때만 따로 불러오는 큰 청크
    chunkSizeWarningLimit: 7000,
  },
});
