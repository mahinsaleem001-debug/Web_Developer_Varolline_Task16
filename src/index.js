/**
 * Reflex: a tiny reactive UI library. No framework, no build step, no dependencies.
 */
export { h, Fragment, tags, cx, isVNode } from './vnode.js';
export { render, unmountRoot, useState, useReducer, useEffect, useRef, useMemo, useCallback, flushSync } from './core.js';
export { createStore, useStore, persist } from './store.js';
export { Router, Link, navigate, useRoute, matchRoute, configureRouter } from './router.js';
export { devtools } from './debug.js';

import { render, unmountRoot } from './core.js';
import { h } from './vnode.js';

/** createApp(App, document.getElementById('root'), props) */
export function createApp(Component, container, props = {}) {
  render(h(Component, props), container);
  return { unmount: () => unmountRoot(container) };
}
