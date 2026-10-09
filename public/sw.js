// Service worker do LL Caixa: deixa o app abrir sem internet e recebe o lembrete.
// O app é uma página só ("/"), então basta guardar essa página e os arquivos dela.
const CACHE = "ll-caixa-v2";
const ESTATICOS = /\/_next\/static\//;

async function guardarPagina(resposta) {
  const cache = await caches.open(CACHE);
  await cache.put("/", resposta.clone());
  // Guarda também todos os scripts/estilos citados no HTML (para abrir offline na próxima vez).
  const html = await resposta.text();
  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/"(\/_next\/static\/[^"\\]+\.(?:js|css))"/g)) urls.add(m[1]);
  await Promise.all(
    [...urls].map(async (u) => {
      if (await cache.match(u)) return;
      try {
        const r = await fetch(u);
        if (r.ok) await cache.put(u, r);
      } catch {}
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]).catch(() => {});
      try {
        const r = await fetch("/", { cache: "no-store" });
        if (r.ok) await guardarPagina(r);
      } catch {}
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase etc.: direto na rede
  if (url.pathname.startsWith("/api/")) return;

  // Página: rede primeiro (até 4s), senão a cópia guardada.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const r = await Promise.race([
            fetch(req),
            new Promise((_, rej) => setTimeout(() => rej(new Error("lento")), 4000)),
          ]);
          if (r.ok && url.pathname === "/") event.waitUntil(guardarPagina(r.clone()));
          return r;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match("/")) || new Response("Sem internet e sem cópia salva. Abra o app uma vez com internet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  // Arquivos do Next com hash no nome: nunca mudam → cache primeiro.
  if (ESTATICOS.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) cache.put(req, r.clone());
        return r;
      })(),
    );
    return;
  }

  // Ícones, manifest, fontes: usa o guardado e atualiza por trás.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const rede = fetch(req)
        .then((r) => {
          if (r.ok) cache.put(req, r.clone());
          return r;
        })
        .catch(() => hit);
      return hit || rede;
    })(),
  );
});

self.addEventListener("push", (event) => {
  let dados = { titulo: "LL Caixa", corpo: "Lançou tudo da semana?", url: "/" };
  try {
    dados = { ...dados, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: dados.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const abertos = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of abertos) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow(alvo);
    })(),
  );
});
