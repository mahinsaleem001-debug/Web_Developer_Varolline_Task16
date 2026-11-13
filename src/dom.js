import { record } from './debug.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Events whose DOM name is not just the lower-cased prop name. */
const EVENT_NAMES = { onDoubleClick: 'dblclick', onDblClick: 'dblclick' };

const SKIP = new Set(['children', 'key', 'ref', 'data-reflex-ignore']);
const FORM_STATE = ['value', 'checked'];

export const isSvgParent = (parentDom) =>
  parentDom.namespaceURI === SVG_NS && parentDom.localName !== 'foreignObject';

/**
 * Event handlers live in a per-element table. We attach ONE native listener per
 * event name, and it looks the current handler up when the event fires. So a new
 * closure on every render costs nothing: no add/remove listener churn.
 */
function setEvent(dom, prop, fn) {
  const name = EVENT_NAMES[prop] || prop.slice(2).toLowerCase();
  const table = dom._h || (dom._h = {});
  const bound = dom._l || (dom._l = {});
  if (typeof fn === 'function') {
    table[name] = fn;
    if (!bound[name]) {
      bound[name] = true;
      dom.addEventListener(name, (e) => {
        const f = table[name];
        if (f) f.call(dom, e);
      });
    }
  } else {
    delete table[name];
  }
}

function setStyle(dom, oldV, newV) {
  if (typeof newV === 'string') {
    if (dom.style.cssText !== newV) {
      dom.style.cssText = newV;
      record('update', dom, 'style');
    }
    return;
  }
  const o = oldV && typeof oldV === 'object' ? oldV : {};
  const n = newV && typeof newV === 'object' ? newV : {};
  let changed = false;
  for (const k of Object.keys(o)) {
    if (!(k in n)) {
      setCssProp(dom, k, '');
      changed = true;
    }
  }
  for (const k of Object.keys(n)) {
    if (o[k] !== n[k]) {
      setCssProp(dom, k, n[k]);
      changed = true;
    }
  }
  if (typeof oldV === 'string' && !newV) dom.style.cssText = '';
  if (changed) record('update', dom, 'style');
}

function setCssProp(dom, k, v) {
  const val = v === null || v === undefined || v === false ? '' : String(v);
  if (k.startsWith('--') || k.includes('-')) dom.style.setProperty(k, val);
  else dom.style[k] = val;
}

function setProp(dom, k, oldV, newV, isSvg) {
  if (SKIP.has(k)) return;

  if (k.length > 2 && k[0] === 'o' && k[1] === 'n' && (typeof newV === 'function' || typeof oldV === 'function')) {
    setEvent(dom, k, newV);
    return; // swapping a handler never touches the DOM, so it is not reported
  }
  if (k === 'style') return setStyle(dom, oldV, newV);

  if (k === 'class' || k === 'className') {
    const v = newV === null || newV === undefined || newV === false ? '' : String(newV);
    if (isSvg) dom.setAttribute('class', v);
    else if (dom.className !== v) dom.className = v;
    else return;
    record('update', dom, 'class');
    return;
  }

  if (newV === null || newV === undefined || newV === false) {
    if (!isSvg && k in dom && typeof dom[k] === 'boolean') dom[k] = false;
    dom.removeAttribute(k);
  } else if (newV === true) {
    if (!isSvg && k in dom && typeof dom[k] === 'boolean') dom[k] = true;
    else dom.setAttribute(k, '');
  } else if (!isSvg && k in dom && k !== 'list' && k !== 'form' && k !== 'type') {
    if (dom[k] !== newV) dom[k] = newV;
    else return;
  } else {
    if (dom.getAttribute(k) === String(newV)) return;
    dom.setAttribute(k, newV);
  }
  record('update', dom, k);
}

/** Apply the difference between two props objects to a DOM element. */
export function patchProps(dom, oldP, newP, isSvg) {
  for (const k of Object.keys(oldP)) {
    if (!(k in newP) && !FORM_STATE.includes(k)) setProp(dom, k, oldP[k], undefined, isSvg);
  }
  for (const k of Object.keys(newP)) {
    if (FORM_STATE.includes(k)) continue;
    if (oldP[k] !== newP[k]) setProp(dom, k, oldP[k], newP[k], isSvg);
  }
  // value / checked last (after min, max, options...) and compared with the live
  // DOM, not the old prop: that is what makes controlled inputs work.
  if ('value' in newP) {
    const v = newP.value === null || newP.value === undefined ? '' : String(newP.value);
    if (dom.value !== v) {
      dom.value = v;
      record('update', dom, 'value');
    }
  } else if ('value' in oldP) {
    dom.value = '';
  }
  if ('checked' in newP) {
    const c = !!newP.checked;
    if (dom.checked !== c) {
      dom.checked = c;
      record('update', dom, 'checked');
    }
  } else if ('checked' in oldP) {
    dom.checked = false;
  }
}
