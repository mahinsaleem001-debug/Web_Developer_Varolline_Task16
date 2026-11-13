import '../testkit/dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { root, tick, click, type, win } from '../testkit/dom.js';
import { h, tags, render, Fragment, cx, useState, devtools } from '../src/index.js';

const { div, p, ul, li, span, button, input, svg } = tags;

test('h() builds plain vnode objects, key and ref are not props', () => {
  const v = h('div', { class: 'a', key: 'k' }, 'hi', 1);
  assert.equal(v.type, 'div');
  assert.equal(v.key, 'k');
  assert.equal(v.props.key, undefined);
  assert.deepEqual(v.children.map((c) => c.props.text), ['hi', '1']);
});

test('tags shorthand: props are optional', () => {
  const a = div('x');
  const b = div({ id: 'y' }, 'x');
  assert.equal(a.props.id, undefined);
  assert.equal(b.props.id, 'y');
});

test('renders elements, attributes, text and nested children', () => {
  const el = root();
  render(div({ id: 'box', class: 'card', title: 'Hi' }, p('Hello ', span('world'))), el);
  assert.equal(el.innerHTML, '<div id="box" class="card" title="Hi"><p>Hello <span>world</span></p></div>');
});

test('null, false and booleans render nothing but keep positions stable', () => {
  const el = root();
  render(div(null, false, 'a', true, undefined), el);
  assert.equal(el.firstChild.textContent, 'a');
});

test('arrays and Fragments are flattened', () => {
  const el = root();
  render(ul([li('1'), [li('2')], h(Fragment, null, li('3'), li('4'))]), el);
  assert.equal(el.querySelectorAll('li').length, 4);
});

test('text is inserted as text, never as HTML (no XSS through content)', () => {
  const el = root();
  render(div('<img src=x onerror=alert(1)>'), el);
  assert.equal(el.querySelector('img'), null);
  assert.equal(el.textContent, '<img src=x onerror=alert(1)>');
});

test('second render() diffs: same DOM nodes are reused, only text changes', () => {
  const el = root();
  render(div(p('Count: ', span('1')), button('go')), el);
  const pEl = el.querySelector('p');
  const spanEl = el.querySelector('span');
  const btn = el.querySelector('button');
  devtools.reset();
  render(div(p('Count: ', span('2')), button('go')), el);
  assert.equal(el.querySelector('p'), pEl);
  assert.equal(el.querySelector('span'), spanEl);
  assert.equal(el.querySelector('button'), btn);
  assert.equal(el.querySelector('span').textContent, '2');
  assert.equal(devtools.stats.update, 1, 'exactly one DOM write');
  assert.equal(devtools.stats.create, 0);
  assert.equal(devtools.stats.remove, 0);
});

test('changing the element type replaces that node only', () => {
  const el = root();
  render(div(span('a'), p('keep')), el);
  const keep = el.querySelector('p');
  render(div(button('a'), p('keep')), el);
  assert.equal(el.querySelector('span'), null);
  assert.ok(el.querySelector('button'));
  assert.equal(el.querySelector('p'), keep);
});

test('attributes: added, changed and removed', () => {
  const el = root();
  render(div({ title: 'a', 'data-x': '1', hidden: true }), el);
  const d = el.firstChild;
  assert.equal(d.getAttribute('title'), 'a');
  assert.equal(d.hidden, true);
  render(div({ title: 'b' }), el);
  assert.equal(d.getAttribute('title'), 'b');
  assert.equal(d.hasAttribute('data-x'), false);
  assert.equal(d.hidden, false);
});

test('class and style (string and object) are patched', () => {
  const el = root();
  render(div({ class: cx('a', false, { b: true }), style: { color: 'red', fontSize: '12px' } }), el);
  const d = el.firstChild;
  assert.equal(d.className, 'a b');
  assert.equal(d.style.color, 'red');
  render(div({ class: 'a', style: { color: 'blue' } }), el);
  assert.equal(d.className, 'a');
  assert.equal(d.style.color, 'blue');
  assert.equal(d.style.fontSize, '');
  render(div({ style: 'margin: 4px' }), el);
  assert.equal(d.style.margin, '4px');
});

test('SVG elements are created in the SVG namespace', () => {
  const el = root();
  render(svg({ viewBox: '0 0 10 10', width: 10 }, h('circle', { cx: 5, cy: 5, r: 4, class: 'dot' })), el);
  const circle = el.querySelector('circle');
  assert.equal(circle.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(circle.getAttribute('class'), 'dot');
  assert.equal(circle.getAttribute('r'), '4');
});

test('ref objects and callbacks receive the DOM node', () => {
  const el = root();
  const obj = { current: null };
  let got = null;
  render(div(input({ ref: obj }), button({ ref: (n) => (got = n) }, 'x')), el);
  assert.equal(obj.current, el.querySelector('input'));
  assert.equal(got, el.querySelector('button'));
  render(div(), el);
  assert.equal(obj.current, null);
});

/* ---------------------------------------------------------------- events */

test('events: handler runs, and a new closure each render is used (no stale handler)', () => {
  const el = root();
  const calls = [];
  render(button({ onClick: () => calls.push('first') }, 'x'), el);
  const btn = el.firstChild;
  click(btn);
  render(button({ onClick: () => calls.push('second') }, 'x'), el);
  click(btn);
  assert.deepEqual(calls, ['first', 'second']);
});

test('events: swapping a handler adds no extra native listeners and is not a DOM write', () => {
  const el = root();
  let n = 0;
  const orig = win.HTMLElement.prototype.addEventListener;
  let adds = 0;
  win.HTMLElement.prototype.addEventListener = function (...a) {
    adds++;
    return orig.apply(this, a);
  };
  render(button({ onClick: () => n++ }, 'x'), el);
  devtools.reset();
  for (let i = 0; i < 5; i++) render(button({ onClick: () => n++ }, 'x'), el);
  win.HTMLElement.prototype.addEventListener = orig;
  assert.equal(adds, 1);
  assert.equal(devtools.stats.update, 0);
  click(el.firstChild);
  assert.equal(n, 1);
});

test('events: removing the handler stops it from firing', () => {
  const el = root();
  let n = 0;
  render(button({ onClick: () => n++ }, 'x'), el);
  click(el.firstChild);
  render(button('x'), el);
  click(el.firstChild);
  assert.equal(n, 1);
});

test('events: onDoubleClick maps to dblclick and event object is passed', () => {
  const el = root();
  let ev = null;
  render(div({ onDoubleClick: (e) => (ev = e) }, 'x'), el);
  el.firstChild.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(ev.type, 'dblclick');
});

/* ------------------------------------------------------- controlled input */

test('controlled input: DOM follows the value prop, even if the user typed something else', async () => {
  const el = root();
  function Field() {
    const [v, setV] = useState('a');
    return input({ value: v, onInput: (e) => setV(e.target.value.toUpperCase()) });
  }
  render(h(Field), el);
  const inp = el.querySelector('input');
  assert.equal(inp.value, 'a');
  type(inp, 'hello');
  await tick();
  assert.equal(inp.value, 'HELLO');
  assert.equal(el.querySelector('input'), inp, 'same input element is kept');
});

test('checkbox checked prop is synced with the DOM', () => {
  const el = root();
  render(input({ type: 'checkbox', checked: true }), el);
  assert.equal(el.firstChild.checked, true);
  render(input({ type: 'checkbox', checked: false }), el);
  assert.equal(el.firstChild.checked, false);
});

test('select value is applied after its options exist', () => {
  const el = root();
  render(h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')), el);
  assert.equal(el.firstChild.value, 'b');
});
