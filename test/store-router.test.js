import '../testkit/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { root, tick, click, win } from '../testkit/dom.js';
import { h, tags, render, useStore, createStore, persist, Router, Link, navigate, useRoute, matchRoute } from '../src/index.js';

const { div, p, button } = tags;

/* ------------------------------------------------------------------ store */

test('store: get / set (merge) / set(fn) / subscribe', () => {
  const s = createStore({ a: 1, b: 2 });
  const seen = [];
  const off = s.subscribe((st) => seen.push(st));
  s.set({ a: 5 });
  assert.deepEqual(s.get(), { a: 5, b: 2 });
  s.set((st) => ({ ...st, b: 9 }));
  s.set((st) => st); // same reference: no notification
  off();
  s.set({ a: 0 });
  assert.equal(seen.length, 2);
});

test('useStore: component updates when the store changes', async () => {
  const el = root();
  const store = createStore({ n: 0 });
  const Show = () => p(useStore(store, (s) => s.n));
  render(h(Show), el);
  store.set({ n: 4 });
  await tick();
  assert.equal(el.textContent, '4');
});

test('useStore with a selector: unrelated changes do not re-render', async () => {
  const el = root();
  const store = createStore({ a: 0, b: 0 });
  let renders = 0;
  const OnlyA = () => {
    renders++;
    return p(useStore(store, (s) => s.a));
  };
  render(h(OnlyA), el);
  await tick();
  const base = renders;
  store.set({ b: 1 });
  store.set({ b: 2 });
  await tick();
  assert.equal(renders, base);
  store.set({ a: 1 });
  await tick();
  assert.equal(renders, base + 1);
  assert.equal(el.textContent, '1');
});

test('useStore unsubscribes on unmount', async () => {
  const el = root();
  const store = createStore({ n: 0 });
  let subs = 0;
  const orig = store.subscribe;
  store.subscribe = (fn) => {
    subs++;
    const off = orig(fn);
    return () => {
      subs--;
      off();
    };
  };
  const C = () => p(useStore(store, (s) => s.n));
  render(h(C), el);
  assert.equal(subs, 1);
  render(div(), el);
  assert.equal(subs, 0);
});

test('persist: loads saved state and saves changes', () => {
  win.localStorage.setItem('k', JSON.stringify({ n: 7 }));
  const s = createStore({ n: 0 });
  persist(s, 'k');
  assert.equal(s.get().n, 7);
  s.set({ n: 8 });
  assert.equal(JSON.parse(win.localStorage.getItem('k')).n, 8);
});

test('persist: broken JSON in storage falls back to the default', () => {
  win.localStorage.setItem('bad', '{nope');
  const s = createStore({ n: 1 });
  persist(s, 'bad');
  assert.equal(s.get().n, 1);
});

/* ----------------------------------------------------------------- router */

test('matchRoute: static, params, wildcard, priority', () => {
  const A = () => 1, B = () => 2, C = () => 3, N = () => 4;
  const routes = { '/': A, '/tasks': B, '/tasks/:id': C, '/tasks/new': N, '*': () => 0 };
  assert.equal(matchRoute(routes, '/').Component, A);
  assert.equal(matchRoute(routes, '/tasks/').Component, B);
  const m = matchRoute(routes, '/tasks/42');
  assert.equal(m.Component, C);
  assert.deepEqual(m.params, { id: '42' });
  assert.equal(matchRoute(routes, '/tasks/new').Component, N, 'static beats :param');
  assert.equal(matchRoute(routes, '/nope/x/y').pattern, '*');
  assert.equal(matchRoute({ '/': A }, '/missing'), null);
});

test('matchRoute: params are URL-decoded', () => {
  const m = matchRoute({ '/u/:name': () => 0 }, '/u/Mahin%20S');
  assert.equal(m.params.name, 'Mahin S');
});

test('Router renders the matched page and changes when the URL changes', async () => {
  const el = root();
  win.location.hash = '#/';
  const Home = () => p({ id: 'page' }, 'home');
  const Task = ({ params }) => p({ id: 'page' }, 'task ', params.id);
  const NotFound = () => p({ id: 'page' }, '404');
  render(h(Router, { routes: { '/': Home, '/tasks/:id': Task, '*': NotFound } }), el);
  assert.equal(el.textContent, 'home');
  navigate('/tasks/9');
  await tick();
  assert.equal(el.textContent, 'task 9');
  navigate('/zzz');
  await tick();
  assert.equal(el.textContent, '404');
  win.location.hash = '#/tasks/3';
  win.dispatchEvent(new win.Event('hashchange'));
  await tick();
  assert.equal(el.textContent, 'task 3');
});

test('Router passes the query string', async () => {
  const el = root();
  navigate('/search?q=reflex&page=2');
  const Search = ({ query }) => p(query.q, '|', query.page);
  render(h(Router, { routes: { '/search': Search } }), el);
  assert.equal(el.textContent, 'reflex|2');
});

test('Link: real href, aria-current on exact match, active class on the section', async () => {
  const el = root();
  navigate('/tasks/1');
  render(
    div(
      h(Link, { to: '/tasks' }, 'Tasks'),
      h(Link, { to: '/tasks/1' }, 'One'),
      h(Link, { to: '/about', class: 'nav' }, 'About')
    ),
    el
  );
  const [tasks, one, about] = el.querySelectorAll('a');
  assert.equal(tasks.getAttribute('href'), '#/tasks');
  assert.ok(tasks.classList.contains('active'), 'section is active');
  assert.equal(tasks.getAttribute('aria-current'), null);
  assert.equal(one.getAttribute('aria-current'), 'page');
  assert.ok(about.classList.contains('nav') && !about.classList.contains('active'));
  navigate('/about');
  await tick();
  assert.equal(about.getAttribute('aria-current'), 'page');
  assert.equal(one.getAttribute('aria-current'), null);
});

test('useRoute gives the current path', async () => {
  const el = root();
  navigate('/x');
  const Where = () => p(useRoute().path);
  render(h(Where), el);
  assert.equal(el.textContent, '/x');
  navigate('/y');
  await tick();
  assert.equal(el.textContent, '/y');
});

test('navigating to the same route does not re-render', async () => {
  const el = root();
  navigate('/same');
  let renders = 0;
  const C = () => {
    renders++;
    return p(useRoute().path);
  };
  render(h(C), el);
  await tick();
  const base = renders;
  navigate('/same');
  await tick();
  assert.equal(renders, base);
});
