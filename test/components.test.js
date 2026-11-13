import '../testkit/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { root, tick, click } from '../testkit/dom.js';
import { h, tags, render, unmountRoot, createApp, useState, useReducer, useEffect, useRef, useMemo, useCallback, devtools, flushSync } from '../src/index.js';

const { div, p, button, span, ul, li } = tags;

test('a component is a function from props to a vnode', () => {
  const el = root();
  const Hello = ({ name }) => p('Hello, ', name);
  render(div(h(Hello, { name: 'Mahin' })), el);
  assert.equal(el.textContent, 'Hello, Mahin');
});

test('children are passed to a component as props.children', () => {
  const el = root();
  const Box = ({ children }) => div({ class: 'box' }, children);
  render(h(Box, null, p('a'), p('b')), el);
  assert.equal(el.querySelectorAll('.box p').length, 2);
});

test('useState: click updates the UI and only the changed text node is written', async () => {
  const el = root();
  function Counter() {
    const [n, setN] = useState(0);
    return div(span({ id: 'label' }, 'Count: ', n), button({ onClick: () => setN(n + 1) }, '+'));
  }
  render(h(Counter), el);
  const label = el.querySelector('#label');
  const btn = el.querySelector('button');
  devtools.reset();
  click(btn);
  await tick();
  assert.equal(label.textContent, 'Count: 1');
  assert.equal(el.querySelector('button'), btn);
  assert.equal(devtools.stats.update, 1);
  assert.equal(devtools.stats.create, 0);
});

test('state updates are batched: many setState calls, one render', async () => {
  const el = root();
  let renders = 0;
  let api;
  function C() {
    renders++;
    const [a, setA] = useState(0);
    const [b, setB] = useState(0);
    api = { setA, setB };
    return p(a, '-', b);
  }
  render(h(C), el);
  api.setA(1);
  api.setA((x) => x + 1);
  api.setB(5);
  await tick();
  assert.equal(renders, 2);
  assert.equal(el.textContent, '2-5');
});

test('setting the same value does not re-render', async () => {
  const el = root();
  let renders = 0;
  let set;
  function C() {
    renders++;
    const [v, setV] = useState(1);
    set = setV;
    return p(v);
  }
  render(h(C), el);
  set(1);
  await tick();
  assert.equal(renders, 1);
});

test('only the component that owns the state re-renders (siblings and parent are untouched)', async () => {
  const el = root();
  const counts = { parent: 0, a: 0, b: 0 };
  let setA;
  function A() {
    counts.a++;
    const [n, set] = useState(0);
    setA = set;
    return p({ id: 'a' }, 'A=', n);
  }
  function B() {
    counts.b++;
    return p({ id: 'b' }, 'B');
  }
  function Parent() {
    counts.parent++;
    return div(h(A), h(B));
  }
  render(h(Parent), el);
  setA(1);
  await tick();
  assert.deepEqual(counts, { parent: 1, a: 2, b: 1 });
  assert.equal(el.querySelector('#a').textContent, 'A=1');
});

test('when a parent re-renders, children with unchanged props are skipped', async () => {
  const el = root();
  const counts = { child: 0 };
  let setN;
  function Child({ label }) {
    counts.child++;
    return span(label);
  }
  function Parent() {
    const [n, set] = useState(0);
    setN = set;
    return div(p(n), h(Child, { label: 'fixed' }));
  }
  render(h(Parent), el);
  devtools.reset();
  setN(1);
  await tick();
  assert.equal(counts.child, 1, 'child did not render again');
  assert.equal(devtools.stats.skipped, 1);
});

test('a child does re-render when its props change', async () => {
  const el = root();
  let setN;
  function Child({ n }) {
    return span(n);
  }
  function Parent() {
    const [n, set] = useState(0);
    setN = set;
    return div(h(Child, { n }));
  }
  render(h(Parent), el);
  setN(3);
  await tick();
  assert.equal(el.textContent, '3');
});

test('parent and child both dirty: the child renders once, not twice', async () => {
  const el = root();
  let childRenders = 0;
  let setP, setC;
  function Child({ v }) {
    childRenders++;
    const [c, sc] = useState(0);
    setC = sc;
    return span(v, ':', c);
  }
  function Parent() {
    const [v, sp] = useState(0);
    setP = sp;
    return div(h(Child, { v }));
  }
  render(h(Parent), el);
  setC(1);
  setP(1);
  await tick();
  assert.equal(childRenders, 2); // initial + one combined update
  assert.equal(el.textContent, '1:1');
});

test('useReducer', async () => {
  const el = root();
  let dispatch;
  function C() {
    const [s, d] = useReducer((st, a) => (a === 'inc' ? st + 1 : st), 0);
    dispatch = d;
    return p(s);
  }
  render(h(C), el);
  dispatch('inc');
  dispatch('inc');
  await tick();
  assert.equal(el.textContent, '2');
});

test('useEffect: runs after render, re-runs only when deps change, cleans up', async () => {
  const el = root();
  const log = [];
  let setA, setB;
  function C() {
    const [a, sa] = useState(0);
    const [b, sb] = useState(0);
    setA = sa;
    setB = sb;
    useEffect(() => {
      log.push('run a=' + a);
      return () => log.push('cleanup a=' + a);
    }, [a]);
    return p(a, b);
  }
  render(h(C), el);
  assert.deepEqual(log, ['run a=0']);
  setB(1);
  await tick();
  assert.deepEqual(log, ['run a=0'], 'b changed: effect is not re-run');
  setA(1);
  await tick();
  assert.deepEqual(log, ['run a=0', 'cleanup a=0', 'run a=1']);
  unmountRoot(el);
  assert.deepEqual(log, ['run a=0', 'cleanup a=0', 'run a=1', 'cleanup a=1']);
});

test('useEffect with [] runs once; without deps runs every render', async () => {
  const el = root();
  let once = 0, every = 0, set;
  function C() {
    const [n, s] = useState(0);
    set = s;
    useEffect(() => void once++, []);
    useEffect(() => void every++);
    return p(n);
  }
  render(h(C), el);
  set(1);
  await tick();
  set(2);
  await tick();
  assert.equal(once, 1);
  assert.equal(every, 3);
});

test('an effect that sets state triggers another render', async () => {
  const el = root();
  function C() {
    const [n, set] = useState(0);
    useEffect(() => set(10), []);
    return p(n);
  }
  render(h(C), el);
  await tick();
  assert.equal(el.textContent, '10');
});

test('effects of children run before effects of parents', () => {
  const el = root();
  const order = [];
  const Child = () => {
    useEffect(() => void order.push('child'), []);
    return p('c');
  };
  const Parent = () => {
    useEffect(() => void order.push('parent'), []);
    return div(h(Child));
  };
  render(h(Parent), el);
  assert.deepEqual(order, ['child', 'parent']);
});

test('unmounting a component removes its DOM and runs cleanups of the whole subtree', async () => {
  const el = root();
  const log = [];
  let setShow;
  const Child = () => {
    useEffect(() => () => log.push('child cleaned'), []);
    return p('child');
  };
  function Parent() {
    const [show, s] = useState(true);
    setShow = s;
    return div(show ? h(Child) : null, span('after'));
  }
  render(h(Parent), el);
  setShow(false);
  await tick();
  assert.deepEqual(log, ['child cleaned']);
  assert.equal(el.querySelector('p'), null);
  assert.ok(el.querySelector('span'));
});

test('setState after unmount does nothing (no error)', async () => {
  const el = root();
  let set;
  const C = () => {
    const [n, s] = useState(0);
    set = s;
    return p(n);
  };
  render(h(C), el);
  unmountRoot(el);
  set(1);
  await tick();
  assert.equal(el.innerHTML, '');
});

test('useRef keeps the same object and does not cause renders', async () => {
  const el = root();
  const seen = [];
  let set;
  function C() {
    const r = useRef(0);
    const [, s] = useState(0);
    set = s;
    r.current++;
    seen.push(r);
    return p(r.current);
  }
  render(h(C), el);
  set((x) => x + 1);
  await tick();
  assert.equal(seen[0], seen[1]);
  assert.equal(el.textContent, '2');
});

test('useMemo / useCallback only recompute when deps change', async () => {
  const el = root();
  let computed = 0, set;
  const fns = [];
  function C({ k }) {
    const [n, s] = useState(0);
    set = s;
    const v = useMemo(() => (computed++, k * 2), [k]);
    fns.push(useCallback(() => v, [v]));
    return p(v, n);
  }
  render(h(C, { k: 2 }), el);
  set(1);
  await tick();
  assert.equal(computed, 1);
  assert.equal(fns[0], fns[1]);
});

test('hooks outside a component throw a clear error', () => {
  assert.throws(() => useState(0), /only be called while a component is rendering/);
});

test('a component that returns an array gets a helpful error', () => {
  assert.throws(() => render(h(() => [p('a'), p('b')]), root()), /single root/);
});

test('a runaway state loop is stopped with a clear error', () => {
  const el = root();
  const bad = () => {
    const [n, set] = useState(0);
    useEffect(() => set(n + 1));
    return p(n);
  };
  render(h(bad), el);
  assert.throws(() => flushSync(), /Too many re-renders/);
});

test('list of stateful components keeps each item\'s state when the list is reordered', async () => {
  const el = root();
  function Item({ name }) {
    const [n, set] = useState(0);
    return li({ onClick: () => set(n + 1) }, name, ':', n);
  }
  const view = (names) => ul(names.map((k) => h(Item, { key: k, name: k })));
  render(view(['a', 'b', 'c']), el);
  click(el.querySelectorAll('li')[2]); // bump c
  await tick();
  render(view(['c', 'a', 'b']), el);
  assert.equal(el.querySelector('li').textContent, 'c:1', 'c kept its state after moving');
});

test('createApp mounts and unmount() cleans up', () => {
  const el = root();
  const log = [];
  const App = ({ title }) => {
    useEffect(() => () => log.push('bye'), []);
    return div(title);
  };
  const app = createApp(App, el, { title: 'T' });
  assert.equal(el.textContent, 'T');
  app.unmount();
  assert.equal(el.innerHTML, '');
  assert.deepEqual(log, ['bye']);
});
