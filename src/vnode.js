/**
 * Virtual nodes: plain objects that describe what the UI should look like.
 * Nothing here touches the DOM.
 */
export const VNODE = Symbol.for('reflex.vnode');
export const TEXT = '#text';
export const EMPTY = '#empty';
export const Fragment = Symbol.for('reflex.fragment');

export const isVNode = (x) => x !== null && typeof x === 'object' && x[VNODE] === true;

function make(type, props, children, key, ref) {
  return { [VNODE]: true, type, props, children, key, ref, _dom: null, _inst: null };
}

export const textVNode = (text) => make(TEXT, { text: String(text) }, [], null, null);
export const emptyVNode = () => make(EMPTY, {}, [], null, null);

/**
 * Turn anything a user may put in a children position into vnodes.
 * - arrays are flattened, Fragments are inlined
 * - strings and numbers become text nodes
 * - null / undefined / true / false become an empty placeholder so that
 *   `cond && <Thing/>` keeps every sibling at a stable position
 */
function normalize(list, out) {
  for (const c of list) {
    if (Array.isArray(c)) normalize(c, out);
    else if (isVNode(c)) {
      if (c.type === Fragment) normalize(c.children, out);
      else out.push(c);
    } else if (c === null || c === undefined || typeof c === 'boolean') out.push(emptyVNode());
    else out.push(textVNode(c));
  }
  return out;
}

/** h('div', { class: 'card' }, 'Hello', h('b', null, 'world')) */
export function h(type, props, ...children) {
  const p = props ? { ...props } : {};
  const key = p.key === undefined ? null : p.key;
  const ref = p.ref === undefined ? null : p.ref;
  delete p.key;
  delete p.ref;
  return make(type, p, normalize(children, []), key, ref);
}

/** Result of calling a component: always exactly one vnode. */
export function toVNode(out) {
  if (isVNode(out)) {
    if (out.type === Fragment) {
      throw new Error('A component must return a single root element. Wrap the Fragment in an element such as <div>.');
    }
    return out;
  }
  if (Array.isArray(out)) throw new Error('A component must return a single root element, not an array.');
  if (out === null || out === undefined || typeof out === 'boolean') return emptyVNode();
  return textVNode(out);
}

const isProps = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && !isVNode(x);

/**
 * Shorthand element builders so no JSX or build step is needed:
 *   const { div, button } = tags;
 *   div({ class: 'box' }, button({ onClick }, 'Go'))
 * The props object is optional.
 */
export const tags = new Proxy(
  {},
  {
    get: (_, tag) => (...args) => {
      const props = args.length && isProps(args[0]) ? args.shift() : null;
      return h(String(tag), props, ...args);
    }
  }
);

/** Tiny class-name helper: cx('a', cond && 'b', { c: true }) -> "a b c" */
export function cx(...parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === 'string') out.push(p);
    else if (Array.isArray(p)) out.push(cx(...p));
    else if (typeof p === 'object') for (const k of Object.keys(p)) if (p[k]) out.push(k);
  }
  return out.join(' ');
}
