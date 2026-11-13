import { createStore, persist } from '../src/index.js';

/**
 * App state lives outside the components, in two small stores.
 * Components read slices with useStore() and call these actions to change it.
 */
const seed = [
  { id: 1, title: 'Read how the diff works', done: true, notes: 'Start with src/core.js, function patch().' },
  { id: 2, title: 'Add a task of your own', done: false, notes: '' },
  { id: 3, title: 'Move a task up and watch the panel', done: false, notes: 'Only one DOM node should move.' },
  { id: 4, title: 'Open a task to see the router in action', done: false, notes: '' }
];

export const tasks = createStore({ items: seed, filter: 'all', nextId: 5 });
persist(tasks, 'reflex-demo-tasks');

export const shared = createStore({ score: 0 });

export const addTask = (title) =>
  tasks.set((s) => ({ ...s, items: [...s.items, { id: s.nextId, title, done: false, notes: '' }], nextId: s.nextId + 1 }));

export const toggleTask = (id) =>
  tasks.set((s) => ({ ...s, items: s.items.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));

export const updateTask = (id, patch) =>
  tasks.set((s) => ({ ...s, items: s.items.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

export const removeTask = (id) => tasks.set((s) => ({ ...s, items: s.items.filter((t) => t.id !== id) }));

export const setFilter = (filter) => tasks.set({ filter });

/** Swap a task with its neighbour in the visible list (by id). */
export function moveTask(id, otherId) {
  tasks.set((s) => {
    const items = [...s.items];
    const a = items.findIndex((t) => t.id === id);
    const b = items.findIndex((t) => t.id === otherId);
    if (a < 0 || b < 0) return s;
    [items[a], items[b]] = [items[b], items[a]];
    return { ...s, items };
  });
}

export const bumpScore = (by = 1) => shared.set((s) => ({ score: s.score + by }));
