import { h } from './vnode.js';
import { createStore, useStore } from './store.js';

/**
 * A small client-side router.
 *   hash mode (default): URLs look like  index.html#/tasks/3   (works on any static host)
 *   history mode:        URLs look like  /tasks/3              (the server must serve index.html for unknown paths)
 */
const config = { mode: 'hash', base: '' };
let store = null;
let listening = false;

const normalize = (p) => {
  const clean = '/' + String(p || '').split('/').filter(Boolean).join('/');
  return clean;
};

function parseQuery(search) {
  const out = {};
  new URLSearchParams(search).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function readLocation() {
  if (config.mode === 'history') {
    let path = location.pathname;
    if (config.base && path.startsWith(config.base)) path = path.slice(config.base.length);
    return { path: normalize(path), query: parseQuery(location.search) };
  }
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  return { path: normalize(path), query: parseQuery(search) };
}

function sync() {
  const next = readLocation();
  const cur = store.get();
  if (cur.path === next.path && JSON.stringify(cur.query) === JSON.stringify(next.query)) return;
  store.set(() => next);
}

function ensureStore() {
  if (!store) store = createStore(readLocation());
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
  }
  return store;
}

/** Choose the URL style. Call once, before rendering. */
export function configureRouter({ mode = 'hash', base = '' } = {}) {
  config.mode = mode;
  config.base = base.replace(/\/$/, '');
  if (store) store.set(() => readLocation());
}

export function href(to) {
  return config.mode === 'history' ? config.base + to : '#' + to;
}

/** Go to another route from code. */
export function navigate(to, { replace = false } = {}) {
  ensureStore();
  if (config.mode === 'history') {
    history[replace ? 'replaceState' : 'pushState'](null, '', config.base + to);
  } else if (replace) {
    location.replace('#' + to);
  } else {
    location.hash = to;
  }
  sync();
}

/** Current { path, query }. Re-renders the component when the route changes. */
export function useRoute() {
  return useStore(ensureStore());
}

/** '/tasks/:id' matched against '/tasks/7' gives { id: '7' }. Static segments beat parameters. */
export function matchRoute(routes, path) {
  const segs = normalize(path).split('/').filter(Boolean);
  let best = null;
  for (const [pattern, Component] of Object.entries(routes)) {
    if (pattern === '*') continue;
    const parts = normalize(pattern).split('/').filter(Boolean);
    if (parts.length !== segs.length) continue;
    const params = {};
    const ok = parts.every((part, i) => {
      if (part[0] === ':') {
        try {
          params[part.slice(1)] = decodeURIComponent(segs[i]);
        } catch {
          params[part.slice(1)] = segs[i];
        }
        return true;
      }
      return part === segs[i];
    });
    if (!ok) continue;
    const score = parts.filter((p) => p[0] !== ':').length;
    if (!best || score > best.score) best = { Component, params, pattern, score };
  }
  if (best) return best;
  if (routes['*']) return { Component: routes['*'], params: {}, pattern: '*', score: 0 };
  return null;
}

/** Renders the component whose pattern matches the current URL. */
export function Router({ routes }) {
  const { path, query } = useRoute();
  const match = matchRoute(routes, path);
  return match ? h(match.Component, { params: match.params, query, path }) : null;
}

/**
 * <Link to="/tasks">: a real <a href>, so middle-click, copy-link and screen readers work.
 * It gets aria-current="page" on its exact route and the `activeClass` for the whole section.
 */
export function Link({ to, activeClass = 'active', class: cls, children, ...rest }) {
  const { path } = useRoute();
  const exact = path === normalize(to);
  const section = exact || (to !== '/' && path.startsWith(normalize(to) + '/'));
  const onClick = (e) => {
    if (config.mode !== 'history') return; // hash links already work natively
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    e.preventDefault();
    navigate(to);
  };
  return h(
    'a',
    {
      ...rest,
      href: href(to),
      class: [cls, section ? activeClass : ''].filter(Boolean).join(' '),
      'aria-current': exact ? 'page' : undefined,
      onClick
    },
    ...children
  );
}
