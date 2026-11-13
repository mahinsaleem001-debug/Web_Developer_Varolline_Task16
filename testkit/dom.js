// Gives Node a browser-like DOM so the library can be tested without a browser.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'location', 'history', 'localStorage', 'URLSearchParams']) {
  Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
}

export const win = w;
export const root = () => {
  const el = w.document.getElementById('root');
  el.textContent = '';
  delete el._reflexRoot;
  return el;
};
/** Wait for the batched render pass (a microtask) to finish. */
export const tick = () => new Promise((r) => setTimeout(r, 0));
export const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
export const type = (el, value) => {
  el.value = value;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
};
