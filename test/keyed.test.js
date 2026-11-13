import '../testkit/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { root } from '../testkit/dom.js';
import { tags, render, devtools } from '../src/index.js';

const { ul, li, div } = tags;
const list = (keys) => ul(keys.map((k) => li({ key: k }, k)));
const order = (el) => [...el.querySelectorAll('li')].map((n) => n.textContent).join('');
const nodes = (el) => Object.fromEntries([...el.querySelectorAll('li')].map((n) => [n.textContent, n]));

test('keyed: reordering keeps node identity and writes no text', () => {
  const el = root();
  render(list(['a', 'b', 'c', 'd']), el);
  const before = nodes(el);
  devtools.reset();
  render(list(['d', 'c', 'b', 'a']), el);
  const after = nodes(el);
  assert.equal(order(el), 'dcba');
  for (const k of 'abcd') assert.equal(after[k], before[k], `node ${k} was reused`);
  assert.equal(devtools.stats.update, 0);
  assert.equal(devtools.stats.create, 0);
});

test('keyed: moving the last item to the front is ONE move, not n-1', () => {
  const el = root();
  render(list(['a', 'b', 'c', 'd', 'e']), el);
  devtools.reset();
  render(list(['e', 'a', 'b', 'c', 'd']), el);
  assert.equal(order(el), 'eabcd');
  assert.equal(devtools.stats.move, 1);
});

test('keyed: swapping neighbours is one move', () => {
  const el = root();
  render(list(['a', 'b', 'c']), el);
  devtools.reset();
  render(list(['b', 'a', 'c']), el);
  assert.equal(order(el), 'bac');
  assert.equal(devtools.stats.move, 1);
});

test('keyed: insert in the middle creates one node and moves none', () => {
  const el = root();
  render(list(['a', 'b', 'd']), el);
  const before = nodes(el);
  devtools.reset();
  render(list(['a', 'b', 'c', 'd']), el);
  assert.equal(order(el), 'abcd');
  assert.equal(nodes(el).a, before.a);
  assert.equal(nodes(el).d, before.d);
  assert.equal(devtools.stats.create, 2); // the <li> and its text
  assert.equal(devtools.stats.move, 0);
});

test('keyed: removing from the middle removes exactly that node', () => {
  const el = root();
  render(list(['a', 'b', 'c']), el);
  const before = nodes(el);
  devtools.reset();
  render(list(['a', 'c']), el);
  assert.equal(order(el), 'ac');
  assert.equal(nodes(el).c, before.c);
  assert.equal(devtools.stats.remove, 1);
});

test('keyed: mixed add, remove and reorder in one update ends in the right order', () => {
  const el = root();
  render(list(['a', 'b', 'c', 'd', 'e']), el);
  render(list(['f', 'e', 'b', 'x', 'a']), el);
  assert.equal(order(el), 'febxa');
});

test('keyed: random shuffles always give the right DOM order', () => {
  const el = root();
  let keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  render(list(keys), el);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let round = 0; round < 200; round++) {
    const pool = 'abcdefghijklmnop'.split('');
    const next = pool.filter(() => rnd() < 0.5).sort(() => rnd() - 0.5);
    render(list(next), el);
    assert.equal(order(el), next.join(''), `round ${round}`);
  }
});

test('unkeyed children are matched by position', () => {
  const el = root();
  render(div(div('1'), div('2')), el);
  const first = el.firstChild.firstChild;
  render(div(div('1!'), div('2'), div('3')), el);
  assert.equal(el.firstChild.firstChild, first);
  assert.equal(el.firstChild.children.length, 3);
});

test('cond && element keeps siblings in place (placeholder slot)', () => {
  const el = root();
  const view = (show) => div(show && div({ id: 'x' }, 'x'), div({ id: 'y' }, 'y'));
  render(view(false), el);
  const y = el.querySelector('#y');
  devtools.reset();
  render(view(true), el);
  assert.equal(el.querySelector('#y'), y, 'sibling node is untouched');
  render(view(false), el);
  assert.equal(el.querySelector('#x'), null);
  assert.equal(el.querySelector('#y'), y);
});
