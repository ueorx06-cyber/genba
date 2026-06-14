// キャッシュ名はデプロイのたびに deploy.bat が現在時刻へ自動更新する（スマホのキャッシュ対策）
const CACHE = "genba-v20260614154113";
const ASSETS = ["./index.html", "./manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // HTMLはネットワーク優先＝常に最新を取得。取れたら index.html としてキャッシュ更新。
    // オフライン等で取れない時だけキャッシュにフォールバック（オフライン対応を維持）。
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then(r => r || caches.match(req)))
    );
    return;
  }

  // それ以外（manifest・アイコン等）はキャッシュ優先＝高速
  e.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
