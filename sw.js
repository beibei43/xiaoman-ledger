// 简易 Service Worker：缓存核心静态资源，实现离线可用（PWA）
// 采用 network-first：联网时始终返回最新文件，断网才回退缓存，避免旧 JS 被长期缓存导致“点了没反应”
const CACHE = 'pfw-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './calc.js',
  './charts.js',
  './ui.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 跨域请求（第三方 JSONP / 行情接口等）一律直接放行：
  // 这类 <script> 是 no-cors，响应为不透明响应(status=0)，若被我们的 network-first
  // 拦截会误判为失败、并用 index.html 顶替，导致 JS 解析失败。交给浏览器原生处理，SW 不碰。
  if (url.origin !== self.location.origin) return;
  // network-first：优先拿线上最新文件（确保改动能立即生效）
  // token 过期(401)/服务端错误(5xx)/离线 也回退缓存，保证已安装的 PWA 仍可使用；
  // 但同时通知前端“当前跑的是缓存版”，避免用户在不经意间一直用旧版（旧版可能有已修复的 bug）
  event.respondWith(
    fetch(req)
      .then(res => {
        const fresh = res && res.status >= 200 && res.status < 400 && res.status !== 401;
        if (!fresh) {
          return caches.match(req)
            .then(c => {
              if (c) { notifyStale(); return staleMark(c); }
              return caches.match('./index.html').then(h => (h ? (notifyStale(), staleMark(h)) : res));
            });
        }
        if (res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => {
        notifyStale();
        return caches.match(req).then(c => caches.match('./index.html').then(h => staleMark(c || h)));
      })
  );
});

// 给缓存兜底的响应打上标记：前端据此判断“仍在离线”还是“网络已恢复”，恢复后自动撤掉黄条
function staleMark(res) {
  try {
    if (!res) return res;
    const headers = new Headers(res.headers);
    headers.set('X-PFW-Stale', '1');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: headers });
  } catch (e) { return res; }
}

// 当 SW 用缓存兜底（链接过期 / 离线）时，通知前端显示提示横幅，避免静默使用旧版
function notifyStale() {
  try {
    self.clients.matchAll({ includeUncontrolled: true }).then(function (cls) {
      cls.forEach(function (c) { try { c.postMessage({ type: 'PFW_STALE' }); } catch (e) {} });
    });
  } catch (e) {}
}
