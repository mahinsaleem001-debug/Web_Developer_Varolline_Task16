import { useState, useEffect, useRef } from './core.js';

const isPlainObject = (x) => x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype;

/**
 * A tiny observable store for state shared between components.
 *   store.get()            current state
 *   store.set({ a: 1 })    shallow-merge into an object state
 *   store.set(s => next)   replace the state with what the function returns
 *   store.subscribe(fn)    returns an unsubscribe function
 * State is never mutated; set() always swaps in a new value.
 */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(change) {
      const next =
        typeof change === 'function'
          ? change(state)
          : isPlainObject(state) && isPlainObject(change)
            ? { ...state, ...change }
            : change;
      if (Object.is(next, state)) return;
      state = next;
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    }
  };
}

/**
 * Read a store from a component. Pass a selector to subscribe to just one slice:
 * the component re-renders only when that slice changes.
 */
export function useStore(store, selector = (s) => s, isEqual = Object.is) {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;

  const current = selector(store.get());
  const [, setSlice] = useState(current);

  useEffect(() => {
    const check = () => {
      const next = selectorRef.current(store.get());
      setSlice((prev) => (equalRef.current(prev, next) ? prev : next));
    };
    check(); // the store may have changed between render and subscribe
    return store.subscribe(check);
  }, [store]);

  return current;
}

/** Keep a store in sync with localStorage. Safe when storage is blocked or full. */
export function persist(store, key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      store.set(() => saved);
    }
  } catch {
    /* ignore: start from the default state */
  }
  return store.subscribe((state) => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore: persistence is a convenience */
    }
  });
}
