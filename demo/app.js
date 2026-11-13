import { h, tags, cx, useState, useEffect, useRef, useStore, Router, Link, navigate, useRoute, devtools } from '../src/index.js';
import { tasks, shared, addTask, toggleTask, updateTask, removeTask, setFilter, moveTask, bumpScore } from './state.js';

const { div, span, p, h1, h2, button, input, textarea, label, form, ul, li, nav, main, aside, header, section, strong, code, pre, a, small } = tags;

/* ----------------------------------------------------------------- helpers */

/** A custom hook: set the document title while a page is shown. */
function usePageTitle(title) {
  useEffect(() => {
    document.title = `${title} - Reflex lab`;
  }, [title]);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const Icon = ({ d }) =>
  h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, h('path', { d }));

const ICONS = {
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  back: 'M15 6l-6 6 6 6'
};

/* ------------------------------------------------------------------ shell */

export function App() {
  return div(
    { class: 'app' },
    a({ class: 'skip', href: '#main' , onClick: (e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) m.focus(); } }, 'Skip to content'),
    h(Rail),
    h(Page),
    h(Inspector)
  );
}

function Rail() {
  return header(
    { class: 'rail' },
    div(
      { class: 'brand' },
      h('svg', { viewBox: '0 0 32 32', width: 30, height: 30, 'aria-hidden': 'true' },
        h('circle', { cx: 16, cy: 16, r: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
        h('circle', { cx: 16, cy: 16, r: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, opacity: 0.6 }),
        h('circle', { cx: 16, cy: 16, r: 3, fill: 'var(--coral)' })),
      span('Reflex')
    ),
    nav(
      { 'aria-label': 'Main' },
      ul(
        { class: 'navlist' },
        li(h(Link, { to: '/' }, 'Playground')),
        li(h(Link, { to: '/tasks' }, 'Tasks', h(OpenCount))),
        li(h(Link, { to: '/how' }, 'How it works'))
      )
    ),
    h(ScoreBadge)
  );
}

/** Reads one slice of a store: re-renders only when the open count changes. */
function OpenCount() {
  const open = useStore(tasks, (s) => s.items.filter((t) => !t.done).length);
  return span({ class: 'count', 'aria-label': `${open} open` }, open);
}

function ScoreBadge() {
  const score = useStore(shared, (s) => s.score);
  return p({ class: 'score', role: 'status' }, small('Shared score'), strong(score));
}

/** Renders the current route and moves focus to the new page heading when it changes. */
function Page() {
  const { path } = useRoute();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    const heading = document.querySelector('#main h1');
    if (heading) heading.focus();
  }, [path]);
  return main({ id: 'main', class: 'page', tabindex: '-1' }, h(Router, { routes }));
}

/* ------------------------------------------------------------ playground */

function Playground() {
  usePageTitle('Playground');
  return section(
    { 'aria-labelledby': 'pg' },
    h1({ id: 'pg', tabindex: '-1' }, 'Change one thing, see what moves'),
    p({ class: 'lede' }, 'Click, type and watch the panel on the right. Reflex writes only to the DOM nodes whose data changed.'),
    div({ class: 'grid' }, h(CounterCard), h(MirrorCard), h(SharedCard))
  );
}

function CounterCard() {
  const [n, setN] = useState(0);
  return section(
    { class: 'card', 'aria-labelledby': 'c1' },
    h2({ id: 'c1' }, 'Counter'),
    p({ class: 'big', 'aria-live': 'polite' }, n),
    div(
      { class: 'row' },
      button({ class: 'btn', 'aria-label': 'Subtract one', onClick: () => setN(n - 1) }, h(Icon, { d: ICONS.minus })),
      button({ class: 'btn primary', 'aria-label': 'Add one', onClick: () => setN(n + 1) }, h(Icon, { d: ICONS.plus })),
      button({ class: 'btn ghost', onClick: () => setN(0), disabled: n === 0 }, 'Reset')
    ),
    p({ class: 'hint' }, 'State lives in this component only. The buttons and headings around the number are not touched.')
  );
}

function MirrorCard() {
  const [text, setText] = useState('');
  return section(
    { class: 'card', 'aria-labelledby': 'c2' },
    h2({ id: 'c2' }, 'Mirror'),
    div(
      { class: 'field' },
      label({ for: 'mirror' }, 'Type here'),
      input({ id: 'mirror', type: 'text', value: text, autocomplete: 'off', placeholder: 'Hello, Reflex', onInput: (e) => setText(e.target.value) })
    ),
    p({ class: 'mirror' }, text || 'Nothing typed yet'),
    p({ class: 'hint' }, plural(text.length, 'character', 'characters'), '. Each keystroke updates two text nodes and nothing else.')
  );
}

function SharedCard() {
  const score = useStore(shared, (s) => s.score);
  return section(
    { class: 'card', 'aria-labelledby': 'c3' },
    h2({ id: 'c3' }, 'Shared store'),
    p({ class: 'big' }, score),
    div({ class: 'row' }, button({ class: 'btn primary', onClick: () => bumpScore(1) }, 'Score a point'), button({ class: 'btn ghost', onClick: () => bumpScore(-score) , disabled: score === 0 }, 'Reset')),
    p({ class: 'hint' }, 'The badge in the sidebar reads the same store. Two components, one source of truth, no props passed between them.')
  );
}

/* ------------------------------------------------------------------ tasks */

function Tasks() {
  usePageTitle('Tasks');
  const items = useStore(tasks, (s) => s.items);
  const filter = useStore(tasks, (s) => s.filter);
  const visible = items.filter((t) => (filter === 'open' ? !t.done : filter === 'done' ? t.done : true));
  const open = items.filter((t) => !t.done).length;

  return section(
    { 'aria-labelledby': 'tk' },
    h1({ id: 'tk', tabindex: '-1' }, 'Tasks'),
    p({ class: 'lede' }, plural(open, 'task', 'tasks'), ' open, ', items.length - open, ' done.'),
    h(AddTask),
    div(
      { class: 'filters', role: 'group', 'aria-label': 'Show' },
      ['all', 'open', 'done'].map((f) =>
        button({ key: f, class: cx('chip', filter === f && 'on'), 'aria-pressed': String(filter === f), onClick: () => setFilter(f) }, f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Done')
      )
    ),
    visible.length
      ? ul({ class: 'tasks' }, visible.map((t, i) => h(TaskItem, { key: t.id, task: t, first: i === 0, last: i === visible.length - 1, prev: visible[i - 1] ? visible[i - 1].id : 0, next: visible[i + 1] ? visible[i + 1].id : 0 })))
      : p({ class: 'empty' }, filter === 'all' ? 'No tasks yet. Add your first one above.' : `No ${filter} tasks. Switch the filter to see the others.`)
  );
}

function AddTask() {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const submit = (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setError('Write a title before adding the task.');
      if (inputRef.current) inputRef.current.focus();
      return;
    }
    addTask(t);
    setTitle('');
    setError('');
  };
  return form(
    { class: 'add', onSubmit: submit, novalidate: true },
    div(
      { class: 'field grow' },
      label({ for: 'new-task' }, 'New task'),
      input({ id: 'new-task', ref: inputRef, type: 'text', value: title, autocomplete: 'off', placeholder: 'What needs doing?', 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? 'new-task-err' : undefined, onInput: (e) => { setTitle(e.target.value); if (error) setError(''); } }),
      error ? p({ id: 'new-task-err', class: 'error', role: 'alert' }, error) : null
    ),
    button({ class: 'btn primary', type: 'submit' }, 'Add task')
  );
}

/**
 * One row. Its props are a task object plus a few primitives, so when ANOTHER task
 * changes this component is skipped entirely (see "skipped" in the inspector).
 */
function TaskItem({ task, first, last, prev, next }) {
  return li(
    { class: cx('task', task.done && 'done') },
    input({ type: 'checkbox', id: `t-${task.id}`, checked: task.done, onChange: () => toggleTask(task.id), 'aria-label': `Mark "${task.title}" as ${task.done ? 'open' : 'done'}` }),
    h(Link, { to: `/tasks/${task.id}`, class: 'title' }, task.title),
    div(
      { class: 'actions' },
      button({ class: 'icon', 'aria-label': `Move "${task.title}" up`, disabled: first, onClick: () => moveTask(task.id, prev) }, h(Icon, { d: ICONS.up })),
      button({ class: 'icon', 'aria-label': `Move "${task.title}" down`, disabled: last, onClick: () => moveTask(task.id, next) }, h(Icon, { d: ICONS.down })),
      button({ class: 'icon danger', 'aria-label': `Delete "${task.title}"`, onClick: () => removeTask(task.id) }, h(Icon, { d: ICONS.trash }))
    )
  );
}

function TaskDetail({ params }) {
  const id = Number(params.id);
  const task = useStore(tasks, (s) => s.items.find((t) => t.id === id));
  usePageTitle(task ? task.title : 'Task not found');

  if (!task) {
    return section(
      { 'aria-labelledby': 'nf' },
      h1({ id: 'nf', tabindex: '-1' }, 'That task does not exist'),
      p({ class: 'lede' }, 'It may have been deleted. The address contains the id ', code(params.id), ', and no task has it.'),
      h(Link, { to: '/tasks', class: 'btn primary' }, 'Back to tasks')
    );
  }
  return section(
    { 'aria-labelledby': 'td' },
    p({ class: 'back' }, h(Link, { to: '/tasks' }, h(Icon, { d: ICONS.back }), 'All tasks')),
    h1({ id: 'td', tabindex: '-1' }, task.title),
    p({ class: 'lede' }, 'Route ', code(`/tasks/${params.id}`), ' matched the pattern ', code('/tasks/:id'), ', so ', code('params.id'), ' is ', code(`"${params.id}"`), '.'),
    div(
      { class: 'card wide' },
      div({ class: 'field' }, label({ for: 'd-title' }, 'Title'), input({ id: 'd-title', type: 'text', value: task.title, onInput: (e) => updateTask(id, { title: e.target.value }) })),
      div({ class: 'field' }, label({ for: 'd-notes' }, 'Notes'), textarea({ id: 'd-notes', rows: 4, value: task.notes, placeholder: 'Anything worth remembering', onInput: (e) => updateTask(id, { notes: e.target.value }) })),
      div(
        { class: 'switch-row' },
        input({ type: 'checkbox', role: 'switch', id: 'd-done', checked: task.done, onChange: () => toggleTask(id) }),
        label({ for: 'd-done' }, task.done ? 'Done' : 'Mark as done')
      ),
      div({ class: 'row' }, button({ class: 'btn danger', onClick: () => { removeTask(id); navigate('/tasks'); } }, 'Delete task'), small({ class: 'hint' }, 'Changes save as you type.'))
    )
  );
}

/* -------------------------------------------------------------- how it works */

function How() {
  usePageTitle('How it works');
  const steps = [
    ['Components are functions', 'A component takes props and returns a description of the UI. Calling it again gives a new description.', 'const Hello = ({ name }) => p("Hello, ", name);'],
    ['State marks a component dirty', 'setState stores the value and queues that one component. Many updates in one tick become a single render.', 'const [n, setN] = useState(0);'],
    ['The diff finds what changed', 'The new description is compared with the old one. Same element type: reuse the node and patch props. Lists use keys, so reordering moves nodes instead of rebuilding them.', 'li({ key: task.id }, task.title)'],
    ['Events are looked up, not re-bound', 'One native listener per event name reads the latest handler. A new closure every render costs nothing.', 'button({ onClick: () => setN(n + 1) }, "+")'],
    ['The router is a store', 'The URL feeds a tiny store. Router and Link read it, so only the page that matches changes.', '{ "/tasks/:id": TaskDetail }']
  ];
  return section(
    { 'aria-labelledby': 'hw' },
    h1({ id: 'hw', tabindex: '-1' }, 'How it works'),
    p({ class: 'lede' }, 'Everything on this page is built with about 1,000 lines of plain JavaScript in the src folder. No framework, no build step.'),
    ul({ class: 'steps' }, steps.map(([title, body, snippet]) => li({ key: title, class: 'card step' }, h2(title), p(body), pre(code(snippet))))),
    p({ class: 'hint' }, 'Try it: go to Tasks, turn on "Flash changed nodes" in the panel, and move a task up.')
  );
}

function NotFound({ path }) {
  usePageTitle('Page not found');
  return section(
    { 'aria-labelledby': 'nf' },
    h1({ id: 'nf', tabindex: '-1' }, 'There is no page here'),
    p({ class: 'lede' }, 'Nothing matches ', code(path), '. This is the "*" route.'),
    h(Link, { to: '/', class: 'btn primary' }, 'Back to the playground')
  );
}

const routes = { '/': Playground, '/tasks': Tasks, '/tasks/:id': TaskDetail, '/how': How, '*': NotFound };

/* ---------------------------------------------------------------- inspector */

const KIND = { update: 'changed', create: 'added', move: 'moved', remove: 'removed' };

function tally(list) {
  const map = new Map();
  for (const n of list) map.set(n, (map.get(n) || 0) + 1);
  return [...map].map(([n, c]) => (c > 1 ? `${n} x${c}` : n)).join(', ') || 'none';
}

/**
 * Shows the DOM writes of the last update. It is marked data-reflex-ignore so
 * its own updates are not reported (otherwise it would watch itself forever).
 */
function Inspector() {
  const [batch, setBatch] = useState(devtools.last);
  const [flash, setFlash] = useState(devtools.highlight);
  useEffect(() => devtools.subscribe(setBatch), []);
  useEffect(() => {
    devtools.highlight = flash;
  }, [flash]);

  const writes = batch ? batch.ops.length + batch.truncated : 0;
  const counts = { update: 0, create: 0, move: 0, remove: 0 };
  if (batch) for (const o of batch.ops) counts[o.kind]++;
  const shown = batch ? batch.ops.slice(0, 8) : [];
  const t = devtools.stats;

  return aside(
    { class: 'inspector', 'data-reflex-ignore': '', 'aria-labelledby': 'insp' },
    h2({ id: 'insp' }, 'What just changed'),
    batch
      ? div(
          null,
          p({ class: 'writes' }, strong({ class: 'n' }, writes), span(writes === 1 ? ' DOM write' : ' DOM writes')),
          ul(
            { class: 'tally' },
            Object.keys(KIND).map((k) => li({ key: k, class: cx('t', k, counts[k] === 0 && 'zero') }, counts[k], ' ', KIND[k]))
          ),
          ul(
            { class: 'log' },
            shown.map((o, i) => li({ key: i }, span({ class: cx('dot', o.kind), 'aria-hidden': 'true' }), span({ class: 'kind' }, KIND[o.kind]), ' ', code(o.target), o.detail ? span({ class: 'detail' }, ' ', o.detail) : null)),
            batch.ops.length + batch.truncated > shown.length ? li({ class: 'more' }, `and ${batch.ops.length + batch.truncated - shown.length} more`) : null
          ),
          p({ class: 'meta' }, strong('Re-rendered: '), tally(batch.renders)),
          p({ class: 'meta' }, strong('Skipped, props unchanged: '), tally(batch.skipped))
        )
      : p({ class: 'idle' }, 'Nothing yet. Click, type or change the route and the DOM writes will show up here.'),
    div(
      { class: 'switch-row dark' },
      input({ type: 'checkbox', role: 'switch', id: 'flash', checked: flash, onChange: (e) => setFlash(e.target.checked) }),
      label({ for: 'flash' }, 'Flash changed nodes on the page')
    ),
    p({ class: 'totals' }, `Since load: ${t.update} changed, ${t.create} added, ${t.move} moved, ${t.remove} removed.`)
  );
}
