// JDM Archive 서비스워커 v14.5.1
// 역할 1: 갤럭시 공유 메뉴에서 넘어온 링크/이미지를 받아 앱으로 전달
// 역할 2: 현장처럼 신호가 약할 때 마지막으로 받은 앱 화면을 대신 띄움 (데이터는 원래 폰 안에 있음)
const APP_CACHE = 'jdm-app-v14.5.1';
const SHARE_CACHE = 'jdm-share';
const scoped = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('jdm-app-') && k !== APP_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function handleShare(request) {
  const form = await request.formData();
  const cache = await caches.open(SHARE_CACHE);
  const old = await cache.keys();
  await Promise.all(old.map((k) => cache.delete(k)));

  const files = form.getAll('images').filter((f) => f && typeof f !== 'string' && f.size > 0);
  for (let i = 0; i < files.length; i++) {
    await cache.put(scoped(`./shared/file-${i}`),
      new Response(files[i], { headers: { 'Content-Type': files[i].type || 'image/jpeg' } }));
  }
  const meta = {
    title: form.get('title') || '',
    text: form.get('text') || '',
    url: form.get('url') || '',
    files: files.length,
    ts: Date.now()
  };
  await cache.put(scoped('./shared/meta'),
    new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));

  return Response.redirect(scoped('./?share=1'), 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(req).catch(() => Response.redirect(scoped('./'), 303)));
    return;
  }

  // 앱 화면: 항상 최신을 먼저 받고, 안 되면 저장해둔 화면 사용
  if (req.method === 'GET' && req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        // 브라우저 HTTP 캐시를 거치지 않고 GitHub에 매번 최신 여부를 확인 (예전 코드가 계속 뜨는 문제 방지)
        const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(scoped('./'), copy)).catch(() => {});
        }
        return res;
      } catch (e) {
        const cached = await caches.match(scoped('./'));
        return cached || Response.error();
      }
    })());
  }
});
