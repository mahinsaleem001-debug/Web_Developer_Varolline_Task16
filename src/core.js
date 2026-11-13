import { TEXT, EMPTY, toVNode, textVNode } from './vnode.js';
import { patchProps, isSvgParent, SVG_NS } from './dom.js';
import { record, quiet, recordRender, recordSkip, commit } from './debug.js';

/* ------------------------------------------------------------------ */
/* Component instances                                                  */
/* ------------------------------------------------------------------ */

let currentInst = null;
let hookIndex = 0;

class Instance {
  constructor(vnode, parent) {
    this.type = vnode.type;
    this.props = vnode.props;
    this.children = vnode.children;
    this.vnode = vnode;
    this.hooks = [];
    this.rendered = null; // the vnode this component last returned
    this.depth = parent ? parent.depth + 1 : 0;
    this.mounted = false;
    this.dirty = false;
  }
}

const nameOf = (inst) => inst.type.displayName || inst.type.name || 'Anonymous';

function renderInst(inst) {
  const prevInst = currentInst;
  const prevIndex = hookIndex;
  currentInst = inst;
  hookIndex = 0;
  try {
    return toVNode(inst.type({ ...inst.props, children: inst.children }));
  } finally {
    currentInst = prevInst;
    hookIndex = prevIndex;
  }
}

/** The first real DOM node of a vnode (a component has none of its own). */
export function firstDom(v) {
  return v._inst ? firstDom(v._inst.rendered) : v._dom;
}

/* ------------------------------------------------------------------ */
/* Mounting                                                             */
/* ------------------------------------------------------------------ */

function insert(parentDom, dom, before) {
  parentDom.insertBefore(dom, before);
}

export function mount(v, parentDom, before, parentInst) {
  const ig = !!parentDom._ig;

  if (v.type === TEXT) {
    const dom = document.createTextNode(v.props.text);
    dom._ig = ig;
    v._dom = dom;
    insert(parentDom, dom, before);
    record('create', dom);
    return;
  }
  if (v.type === EMPTY) {
    const dom = document.createComment('');
    dom._ig = ig;
    v._dom = dom;
    insert(parentDom, dom, before);
    return;
  }
  if (typeof v.type === 'function') {
    const inst = new Instance(v, parentInst);
    v._inst = inst;
    recordRender(nameOf(inst));
    inst.rendered = renderInst(inst);
    mount(inst.rendered, parentDom, before, inst);
    inst.mounted = true;
    return;
  }

  // element
  const svg = v.type === 'svg' || isSvgParent(parentDom);
  const dom = svg ? document.createElementNS(SVG_NS, v.type) : document.createElement(v.type);
  dom._ig = ig || v.props['data-reflex-ignore'] !== undefined;
  v._dom = dom;
  for (const child of v.children) mount(child, dom, null, parentInst);
  quiet.on = true; // a brand new node is one 'create', not one write per prop
  patchProps(dom, {}, v.props, svg);
  quiet.on = false;
  insert(parentDom, dom, before); // attach once, after the subtree is built
  record('create', dom);
  setRef(v.ref, dom);
}

function setRef(ref, value) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else ref.current = value;
}

/* ------------------------------------------------------------------ */
/* Unmounting                                                           */
/* ------------------------------------------------------------------ */

export function unmount(v, removeDom) {
  if (v._inst) {
    const inst = v._inst;
    inst.mounted = false;
    for (const hook of inst.hooks) {
      if (hook && typeof hook.cleanup === 'function') {
        const fn = hook.cleanup;
        hook.cleanup = undefined;
        fn();
      }
    }
    unmount(inst.rendered, removeDom);
    return;
  }
  if (v.type !== TEXT && v.type !== EMPTY) {
    setRef(v.ref, null);
    // children only need their component cleanups; the DOM goes with the parent
    for (const c of v.children) unmount(c, false);
  }
  if (removeDom && v._dom) {
    record('remove', v._dom);
    v._dom.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Patching (the diff)                                                  */
/* ------------------------------------------------------------------ */

function shallowEqual(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

/**
 * Compare an old vnode with a new one and change the DOM only where they differ.
 * Returns the new vnode (which now owns the live DOM node).
 */
export function patch(oldV, newV, parentDom, parentInst) {
  if (oldV === newV) return newV; // identical vnode object: nothing can have changed

  if (oldV.type !== newV.type) {
    // different kind of thing: build the new one in place, drop the old one
    mount(newV, parentDom, firstDom(oldV), parentInst);
    unmount(oldV, true);
    return newV;
  }

  if (newV.type === TEXT) {
    const dom = (newV._dom = oldV._dom);
    if (dom.nodeValue !== newV.props.text) {
      dom.nodeValue = newV.props.text;
      record('update', dom, 'text');
    }
    return newV;
  }
  if (newV.type === EMPTY) {
    newV._dom = oldV._dom;
    return newV;
  }

  if (typeof newV.type === 'function') {
    const inst = oldV._inst;
    newV._inst = inst;
    inst.vnode = newV;
    const unchanged = oldV.children.length === 0 && newV.children.length === 0 && shallowEqual(oldV.props, newV.props);
    inst.props = newV.props;
    inst.children = newV.children;
    if (unchanged) {
      recordSkip(nameOf(inst)); // same props, no children: skip the whole subtree
      return newV;
    }
    inst.dirty = false;
    rerender(inst, parentDom);
    return newV;
  }

  // same element type: reuse the DOM node and apply only the differences
  const dom = (newV._dom = oldV._dom);
  patchProps(dom, oldV.props, newV.props, dom.namespaceURI === SVG_NS);
  patchChildren(oldV.children, newV.children, dom, parentInst);
  if (oldV.ref !== newV.ref) {
    setRef(oldV.ref, null);
    setRef(newV.ref, dom);
  }
  return newV;
}

/** Longest increasing subsequence: the children that can stay where they are. */
function stableSet(sources) {
  const tails = [];
  const prev = new Array(sources.length).fill(-1);
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (s < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sources[tails[mid]] < s) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set();
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k >= 0) {
    keep.add(k);
    k = prev[k];
  }
  return keep;
}

function patchChildren(oldKids, newKids, parentDom, parentInst) {
  const byKey = new Map();
  oldKids.forEach((c, i) => {
    if (c.key !== null) byKey.set(c.key, i);
  });
  const used = new Array(oldKids.length).fill(false);
  const result = new Array(newKids.length);
  const sources = new Array(newKids.length).fill(-1); // index in the old list, or -1 for new

  for (let i = 0; i < newKids.length; i++) {
    const nv = newKids[i];
    let oi = -1;
    if (nv.key !== null) {
      const j = byKey.get(nv.key);
      if (j !== undefined && !used[j]) oi = j;
    } else if (i < oldKids.length && oldKids[i].key === null && !used[i]) {
      oi = i;
    }
    if (oi >= 0 && oldKids[oi].type === nv.type) {
      used[oi] = true;
      sources[i] = oi;
      result[i] = patch(oldKids[oi], nv, parentDom, parentInst);
    }
  }

  oldKids.forEach((c, i) => {
    if (!used[i]) unmount(c, true);
  });

  for (let i = 0; i < newKids.length; i++) {
    if (sources[i] < 0) {
      mount(newKids[i], parentDom, null, parentInst);
      result[i] = newKids[i];
    }
  }

  // put every child in its final position, moving as few nodes as possible
  const stable = stableSet(sources);
  let ref = null;
  for (let i = newKids.length - 1; i >= 0; i--) {
    const node = firstDom(result[i]);
    if (sources[i] < 0) {
      if (node.nextSibling !== ref || node.parentNode !== parentDom) insert(parentDom, node, ref);
    } else if (!stable.has(i)) {
      insert(parentDom, node, ref);
      record('move', node);
    }
    ref = node;
  }
  // `result` holds the live vnodes; callers read newV.children, which are the same objects
}

/* ------------------------------------------------------------------ */
/* Updates, scheduling and effects                                      */
/* ------------------------------------------------------------------ */

function rerender(inst, parentDom) {
  recordRender(nameOf(inst));
  const next = renderInst(inst);
  inst.rendered = patch(inst.rendered, next, parentDom, inst);
}

const queue = new Set();
let scheduled = false;

/** Mark a component dirty. Many state changes in one tick become ONE render pass. */
export function schedule(inst) {
  if (!inst.mounted || inst.dirty) return;
  inst.dirty = true;
  queue.add(inst);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

function flush() {
  scheduled = false;
  let guard = 0;
  while (queue.size) {
    if (++guard > 100) {
      queue.clear();
      throw new Error('Too many re-renders: a component keeps updating its own state during render or in an effect.');
    }
    // parents first: if a parent re-renders it may already refresh its children
    const list = [...queue].sort((a, b) => a.depth - b.depth);
    queue.clear();
    for (const inst of list) {
      if (!inst.dirty || !inst.mounted) continue;
      inst.dirty = false;
      const first = firstDom(inst.rendered);
      if (!first || !first.parentNode) continue;
      rerender(inst, first.parentNode);
    }
    runEffects();
  }
  commit();
}

/** Re-render a single component right now (used by tests). */
export function flushSync() {
  scheduled = false;
  flush();
}

const effectQueue = [];

export function queueEffect(inst, hook) {
  effectQueue.push({ inst, hook });
}

export function runEffects() {
  if (!effectQueue.length) return;
  const batch = effectQueue.splice(0, effectQueue.length);
  batch.sort((a, b) => b.inst.depth - a.inst.depth); // children before parents
  for (const { inst, hook } of batch) {
    if (!inst.mounted || !hook.pending) continue;
    hook.pending = false;
    if (typeof hook.cleanup === 'function') hook.cleanup();
    const out = hook.fn();
    hook.cleanup = typeof out === 'function' ? out : undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

function nextHook(name) {
  if (!currentInst) throw new Error(`${name}() can only be called while a component is rendering.`);
  return { inst: currentInst, index: hookIndex++ };
}

export function useState(initial) {
  const { inst, index } = nextHook('useState');
  let hook = inst.hooks[index];
  if (!hook) {
    hook = { value: typeof initial === 'function' ? initial() : initial };
    hook.set = (next) => {
      const value = typeof next === 'function' ? next(hook.value) : next;
      if (Object.is(value, hook.value)) return; // nothing changed: nothing to render
      hook.value = value;
      schedule(inst);
    };
    inst.hooks[index] = hook;
  }
  return [hook.value, hook.set];
}

export function useReducer(reducer, initial, init) {
  const [state, setState] = useState(() => (init ? init(initial) : initial));
  const reducerRef = useRef(reducer);
  reducerRef.current = reducer;
  const dispatch = useCallback((action) => setState((s) => reducerRef.current(s, action)), []);
  return [state, dispatch];
}

const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));

export function useEffect(fn, deps) {
  const { inst, index } = nextHook('useEffect');
  let hook = inst.hooks[index];
  if (!hook) hook = inst.hooks[index] = { deps: undefined, cleanup: undefined, pending: false, fn, first: true };
  if (hook.first || deps === undefined || depsChanged(hook.deps, deps)) {
    hook.first = false;
    hook.deps = deps;
    hook.fn = fn;
    if (!hook.pending) {
      hook.pending = true;
      queueEffect(inst, hook);
    }
  }
}

export function useRef(initial = null) {
  const { inst, index } = nextHook('useRef');
  return inst.hooks[index] || (inst.hooks[index] = { current: initial });
}

export function useMemo(fn, deps) {
  const { inst, index } = nextHook('useMemo');
  const hook = inst.hooks[index];
  if (hook && !depsChanged(hook.deps, deps)) return hook.value;
  const value = fn();
  inst.hooks[index] = { deps, value };
  return value;
}

export function useCallback(fn, deps) {
  return useMemo(() => fn, deps);
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                  */
/* ------------------------------------------------------------------ */

/** Render a vnode into a container. Calling it again diffs against what is there. */
export function render(vnode, container) {
  const next = toVNode(vnode);
  const prev = container._reflexRoot;
  if (prev) {
    container._reflexRoot = patch(prev, next, container, null);
  } else {
    container.textContent = '';
    mount(next, container, null, null);
    container._reflexRoot = next;
  }
  runEffects();
  commit();
}

/** Remove everything Reflex put in the container and run all cleanups. */
export function unmountRoot(container) {
  const prev = container._reflexRoot;
  if (!prev) return;
  unmount(prev, true);
  container._reflexRoot = null;
  commit();
}

export { textVNode };
