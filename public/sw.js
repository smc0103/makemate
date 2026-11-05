/* 내가 그린 친구 서비스 워커
 * - 앱 화면(HTML/JS/CSS/아이콘/글꼴)을 기기에 저장해 인터넷이 끊겨도 앱이 열리게 한다.
 * - 자연물 오리기(마법 가위) 엔진·모델은 처음 한 번 받은 뒤 기기에 저장해 둔다.
 * - AI·음성 API 요청은 절대 저장하지 않는다 (항상 네트워크).
 */
const VERSION = 'v2';
const APP_CACHE = `maeum-app-${VERSION}`;
const FONT_CACHE = `maeum-fonts-${VERSION}`;
// 앱을 업데이트해도 다시 받지 않도록 버전을 붙이지 않는다 (주소에 버전이 들어 있음)
const MODEL_CACHE = 'maeum-models';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('maeum-') && k !== APP_CACHE && k !== FONT_CACHE && k !== MODEL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

function isScissorsModel(url) {
  return (
    (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@mediapipe/tasks-vision@')) ||
    (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/interactive_segmenter/'))
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 글꼴: 저장본 우선
  if (isFont(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // 마법 가위 엔진·모델: 저장본 우선
  if (isScissorsModel(url)) {
    event.respondWith(
      caches.open(MODEL_CACHE).then(async (cache) => {
        const hit = await cache.match(request.url);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request.url, res.clone());
        return res;
      }),
    );
    return;
  }

  // 다른 사이트(AI API, 모델 다운로드 등)는 건드리지 않는다
  if (url.origin !== self.location.origin) return;

  // 페이지 이동: 최신 버전 우선, 인터넷이 없으면 저장본
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // 빌드 파일(파일명에 해시가 붙어 바뀌지 않음): 저장본 우선
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
