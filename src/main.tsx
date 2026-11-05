import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 배포 버전에서만: 앱 화면을 기기에 저장해 인터넷 없이도 열리게 한다
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err: unknown) => console.warn('[sw] 등록 실패', err));
  });
}

// 저장 공간이 부족할 때 브라우저가 친구 영상(IndexedDB)을 지우지 않도록 요청
if (navigator.storage?.persist) {
  void navigator.storage.persisted().then((already) => {
    if (!already) void navigator.storage.persist();
  });
}
