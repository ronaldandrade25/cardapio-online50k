// Service Worker: app abre rápido e funciona com internet instável.
// Ao publicar uma nova versão, aumente o número abaixo para forçar a atualização.
const VERSAO = 'co-v11';
const ESSENCIAIS = [
  '/', '/index.html', '/pedido.html', '/admin/', '/admin/index.html', '/offline.html',
  '/css/base.css', '/css/cliente.css', '/css/admin.css',
  '/js/config.js', '/js/db.js', '/js/utils.js', '/js/seed.js', '/js/cliente.js', '/js/pedido.js',
  '/js/admin/app.js', '/js/admin/acoes.js', '/js/admin/pedidos.js', '/js/admin/mesas.js', '/js/admin/cardapio.js',
  '/js/admin/cupons.js', '/js/admin/clientes.js', '/js/admin/financeiro.js', '/js/admin/dashboard.js',
  '/js/admin/entrega.js', '/js/admin/loja.js', '/js/admin/impressora.js',
  '/manifest.json', '/admin/manifest.json', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca interceptar Firebase/Google APIs (dados em tempo real) nem as funções da Vercel
  if (/googleapis\.com|firebaseio\.com|identitytoolkit|securetoken/.test(url.host) || url.pathname.startsWith('/api/') || url.pathname.startsWith('/p/')) return;

  // Páginas: rede primeiro, cache como reserva
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); return r; })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('/offline.html'))
    );
    return;
  }

  // Arquivos estáticos (inclui fontes, ícones e SDK do Firebase): cache primeiro, atualiza em segundo plano
  e.respondWith(
    caches.match(req).then(cache => {
      const rede = fetch(req).then(r => {
        if (r.ok || r.type === 'opaque') { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
        return r;
      }).catch(() => cache);
      return cache || rede;
    })
  );
});
