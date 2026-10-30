// Camada de dados única: usa o Firestore quando configurado,
// ou o localStorage no modo demo. Todo o resto do sistema só fala com este arquivo.
import { DEMO, firebaseConfig, FIREBASE_SDK, SUPERADMIN_EMAIL } from './config.js';

const INC = '__inc';
/** Incrementa um campo numérico de forma atômica: db.update('x', id, { total: inc(1) }) */
export const inc = n => ({ [INC]: n });

const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ------------------------------------------------------------------ */
/*  Firebase                                                          */
/* ------------------------------------------------------------------ */
let fbPromise = null;
function firebase() {
  if (!fbPromise) {
    fbPromise = Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`)
    ]).then(([appM, F, A]) => {
      const app = appM.initializeApp(firebaseConfig);
      let fs;
      try {
        fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
      } catch {
        fs = F.getFirestore(app);
      }
      return { app, fs, F, A, appM, auth: A.getAuth(app) };
    });
  }
  return fbPromise;
}

function fbValores(F, data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v && typeof v === 'object' && INC in v ? F.increment(v[INC]) : v;
  }
  return out;
}

function fbQuery(F, fs, col, o = {}) {
  const partes = [];
  (o.where || []).forEach(w => partes.push(F.where(...w)));
  if (o.orderBy) partes.push(F.orderBy(o.orderBy[0], o.orderBy[1] || 'asc'));
  if (o.limit) partes.push(F.limit(o.limit));
  return F.query(F.collection(fs, col), ...partes);
}

const snapLista = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

/* ------------------------------------------------------------------ */
/*  Modo demo (localStorage)                                          */
/* ------------------------------------------------------------------ */
const KEY = 'co_db_v1';
let mem = null;
const ouvintes = new Set();

function carregar() {
  if (!mem) {
    try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { mem = {}; }
  }
  return mem;
}
function salvar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch (e) {
    alert('Armazenamento do navegador cheio. No modo demo, use imagens menores.');
    throw e;
  }
  ouvintes.forEach(fn => fn());
}
if (DEMO) {
  window.addEventListener('storage', e => {
    if (e.key === KEY) { mem = null; ouvintes.forEach(fn => fn()); }
  });
}
const colecao = c => (carregar()[c] ||= {});

function compara(a, op, b) {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case 'in': return b.includes(a);
    case 'array-contains': return Array.isArray(a) && a.includes(b);
    default: return true;
  }
}
function localQuery(col, o = {}) {
  let arr = Object.entries(colecao(col)).map(([id, d]) => ({ id, ...structuredClone(d) }));
  (o.where || []).forEach(([f, op, v]) => { arr = arr.filter(d => compara(d[f], op, v)); });
  if (o.orderBy) {
    const [f, dir] = o.orderBy;
    arr.sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  if (o.limit) arr = arr.slice(0, o.limit);
  return arr;
}
function localAplicar(atual = {}, data) {
  const out = { ...atual };
  for (const [k, v] of Object.entries(data)) {
    out[k] = v && typeof v === 'object' && INC in v ? (Number(atual[k]) || 0) + v[INC] : v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  API pública                                                       */
/* ------------------------------------------------------------------ */
export const db = {
  async list(col, o) {
    if (DEMO) return localQuery(col, o);
    const { F, fs } = await firebase();
    return snapLista(await F.getDocs(fbQuery(F, fs, col, o)));
  },

  /** Observa uma coleção em tempo real. Retorna função para parar. */
  watch(col, o, cb) {
    if (DEMO) {
      const fn = () => cb(localQuery(col, o));
      ouvintes.add(fn);
      queueMicrotask(fn);
      return () => ouvintes.delete(fn);
    }
    let parar = () => {};
    let ativo = true;
    firebase().then(({ F, fs }) => {
      if (!ativo) return;
      parar = F.onSnapshot(fbQuery(F, fs, col, o), s => cb(snapLista(s)), e => console.error(col, e));
    });
    return () => { ativo = false; parar(); };
  },

  async get(col, id) {
    if (DEMO) {
      const d = colecao(col)[id];
      return d ? { id, ...structuredClone(d) } : null;
    }
    const { F, fs } = await firebase();
    const s = await F.getDoc(F.doc(fs, col, id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  },

  watchDoc(col, id, cb) {
    if (DEMO) {
      const fn = () => { const d = colecao(col)[id]; cb(d ? { id, ...structuredClone(d) } : null); };
      ouvintes.add(fn);
      queueMicrotask(fn);
      return () => ouvintes.delete(fn);
    }
    let parar = () => {};
    let ativo = true;
    firebase().then(({ F, fs }) => {
      if (!ativo) return;
      parar = F.onSnapshot(F.doc(fs, col, id), s => cb(s.exists() ? { id: s.id, ...s.data() } : null), e => console.error(col, id, e));
    });
    return () => { ativo = false; parar(); };
  },

  async add(col, data) {
    if (DEMO) {
      const id = novoId();
      colecao(col)[id] = localAplicar({}, data);
      salvar();
      return id;
    }
    const { F, fs } = await firebase();
    return (await F.addDoc(F.collection(fs, col), fbValores(F, data))).id;
  },

  async set(col, id, data, merge = false) {
    if (DEMO) {
      const c = colecao(col);
      c[id] = localAplicar(merge ? c[id] : {}, data);
      salvar();
      return id;
    }
    const { F, fs } = await firebase();
    await F.setDoc(F.doc(fs, col, id), fbValores(F, data), { merge });
    return id;
  },

  async update(col, id, data) {
    if (DEMO) {
      const c = colecao(col);
      if (!c[id]) throw new Error('Documento não encontrado');
      c[id] = localAplicar(c[id], data);
      salvar();
      return;
    }
    const { F, fs } = await firebase();
    await F.updateDoc(F.doc(fs, col, id), fbValores(F, data));
  },

  async remove(col, id) {
    if (DEMO) {
      delete colecao(col)[id];
      salvar();
      return;
    }
    const { F, fs } = await firebase();
    await F.deleteDoc(F.doc(fs, col, id));
  },

  /** Cria o pedido com número sequencial (#1, #2, ...) de forma segura. */
  async criarPedido(pedido) {
    if (DEMO) {
      const c = colecao('contadores');
      const n = (c.pedidos?.n || 0) + 1;
      c.pedidos = { n };
      const id = novoId();
      colecao('pedidos')[id] = { ...pedido, numero: n };
      salvar();
      return { id, numero: n };
    }
    const { F, fs } = await firebase();
    const refCont = F.doc(fs, 'contadores', 'pedidos');
    const refPed = F.doc(F.collection(fs, 'pedidos'));
    const numero = await F.runTransaction(fs, async t => {
      const s = await t.get(refCont);
      const n = (s.exists() ? s.data().n : 0) + 1;
      t.set(refCont, { n });
      t.set(refPed, { ...pedido, numero: n });
      return n;
    });
    return { id: refPed.id, numero };
  }
};

/* ------------------------------------------------------------------ */
/*  Autenticação da equipe                                            */
/* ------------------------------------------------------------------ */
const DEMO_USER = 'co_demo_user';

export const auth = {
  /** cb(usuario | null) — usuario = { uid, email, nome, perfil } */
  onChange(cb) {
    if (DEMO) {
      const u = JSON.parse(localStorage.getItem(DEMO_USER) || 'null');
      queueMicrotask(() => cb(u));
      return;
    }
    firebase().then(({ A, auth: a }) => {
      A.onAuthStateChanged(a, async user => {
        if (!user) return cb(null);
        // O superadmin (e-mail do config.js) entra direto; os demais precisam estar na coleção "equipe".
        if ((user.email || '').toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
          return cb({ uid: user.uid, email: user.email, nome: user.displayName || 'Superadmin', perfil: 'dono' });
        }
        const membro = await db.get('equipe', user.uid).catch(() => null);
        cb(membro ? { uid: user.uid, email: user.email, nome: membro.nome, perfil: membro.perfil } : { uid: user.uid, email: user.email, semAcesso: true });
      });
    });
  },

  async login(email, senha) {
    if (DEMO) {
      const u = { uid: 'demo', email, nome: 'Dono (demo)', perfil: 'dono' };
      await db.set('equipe', 'demo', { nome: u.nome, email, perfil: 'dono', criadoEm: Date.now() });
      localStorage.setItem(DEMO_USER, JSON.stringify(u));
      location.reload();
      return;
    }
    const { A, auth: a } = await firebase();
    await A.signInWithEmailAndPassword(a, email, senha);
  },

  async logout() {
    if (DEMO) {
      localStorage.removeItem(DEMO_USER);
      location.reload();
      return;
    }
    const { A, auth: a } = await firebase();
    await A.signOut(a);
  },

  /** Cria um membro da equipe sem deslogar o dono (usa uma 2ª instância do Firebase). */
  async criarMembro(nome, email, senha, perfil) {
    if (DEMO) return db.set('equipe', novoId(), { nome, email, perfil, criadoEm: Date.now() });
    const { appM, A } = await firebase();
    const nomeApp = 'cadastro-' + Date.now();
    const app2 = appM.initializeApp(firebaseConfig, nomeApp);
    const a2 = A.getAuth(app2);
    try {
      const cred = await A.createUserWithEmailAndPassword(a2, email, senha);
      await db.set('equipe', cred.user.uid, { nome, email, perfil, criadoEm: Date.now() });
      await A.signOut(a2);
    } finally {
      await appM.deleteApp(app2);
    }
  },

  async redefinirSenha(email) {
    if (DEMO) return;
    const { A, auth: a } = await firebase();
    await A.sendPasswordResetEmail(a, email);
  }
};
