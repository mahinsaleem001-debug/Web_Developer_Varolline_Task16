/**
 * Devtools hooks. The reconciler reports every real DOM write here, which is
 * how the demo can *show* that only what changed was touched.
 * Subtrees marked with the attribute `data-reflex-ignore` are not reported
 * (the inspector panel uses this so it does not observe itself).
 */
const fresh = () => ({ ops: [], renders: [], skipped: [], truncated: 0 });
let pending = fresh();
const listeners = new Set();
const MAX_OPS = 300;

export const devtools = {
  /** Flash every touched element with a short outline animation. */
  highlight: false,
  /** Running totals since page load (or the last reset). */
  stats: { create: 0, update: 0, move: 0, remove: 0, render: 0, skipped: 0 },
  /** The most recent batch: { ops, renders, skipped, truncated }. */
  last: null,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset() {
    for (const k of Object.keys(this.stats)) this.stats[k] = 0;
    this.last = null;
  }
};

function describe(n) {
  if (!n) return '?';
  if (n.nodeType === 3) {
    const t = n.nodeValue;
    return `"${t.length > 26 ? t.slice(0, 26) + '…' : t}"`;
  }
  if (n.nodeType === 8) return 'empty slot';
  let s = n.localName;
  if (n.id) s += '#' + n.id;
  else if (n.classList && n.classList.length) s += '.' + n.classList[0];
  return `<${s}>`;
}

const COLORS = { create: '#0f9b8e', update: '#ff5c4d', move: '#c98a00', remove: '#7a7f99' };

function flash(node, kind) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el || typeof el.animate !== 'function') return;
  try {
    el.animate(
      [
        { outline: `2px solid ${COLORS[kind]}`, outlineOffset: '2px' },
        { outline: '2px solid transparent', outlineOffset: '2px' }
      ],
      { duration: 1100, easing: 'ease-out' }
    );
  } catch {
    /* animation is optional */
  }
}

export const quiet = { on: false };

export function record(kind, node, detail = '') {
  if (quiet.on || (node && node._ig)) return;
  devtools.stats[kind]++;
  if (pending.ops.length < MAX_OPS) pending.ops.push({ kind, target: describe(node), detail });
  else pending.truncated++;
  if (devtools.highlight && kind !== 'remove') flash(node, kind);
}

export function recordRender(name) {
  devtools.stats.render++;
  pending.renders.push(name);
}

export function recordSkip(name) {
  devtools.stats.skipped++;
  pending.skipped.push(name);
}

/** Called after each render pass. Only batches that really wrote to the DOM are reported. */
export function commit() {
  if (pending.ops.length) {
    const batch = pending;
    devtools.last = batch;
    pending = fresh();
    listeners.forEach((fn) => fn(batch));
  } else {
    pending = fresh();
  }
}
