// Reads the ticket board (tickets/<status>/*.md) and plans how a GitHub Projects board must change to match it.
// Pure functions only; scripts/sync-board.mjs talks to GitHub.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STATUSES = ['backlog', 'todo', 'in-progress', 'waiting-to-merge', 'ready-to-review', 'done'];
// Board fields filled from the ticket: its folder, then its `type::`, `priority::` and `area::` labels.
export const FIELD_KEYS = ['status', 'type', 'priority', 'area'];
// GitHub reserves the field name "Type" for issue types.
const FIELD_NAMES = { type: 'Ticket type' };
export const fieldName = (key) => FIELD_NAMES[key] ?? displayName(key);

// Board names are compared without case, spaces or dashes: `in-progress` matches "In Progress".
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export const displayName = (s) =>
  s.length <= 2 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1).replace(/-/g, ' ');
// Other option names a ticket value also matches, from the default GitHub project templates.
const ALIASES = { readytoreview: ['inreview'], high: ['p0'], medium: ['p1'], low: ['p2'] };
export const findOption = (options, value) => {
  const names = [norm(value), ...(ALIASES[norm(value)] ?? [])];
  return names.map((n) => options.find((o) => norm(o.name) === n)).find(Boolean);
};
const clean = (s) =>
  String(s ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
const idOf = (title) => title.match(/^TAL-\d+\b/)?.[0];

// Command line: <project url> [--repo <owner>/<name>] [--apply], in any order, with env fallbacks.
export function parseArgs(argv, env) {
  const repoFlag = argv.indexOf('--repo');
  const repoValue = repoFlag >= 0 ? argv[repoFlag + 1] : undefined;
  if (repoFlag >= 0 && (!repoValue || repoValue.startsWith('--'))) throw new Error('--repo takes <owner>/<name>');
  const url = argv.find((a, i) => !a.startsWith('--') && (repoFlag < 0 || i !== repoFlag + 1)) ?? env.TALLY_BOARD_URL;
  const repo = (repoValue ?? env.TALLY_BOARD_REPO)?.replace(/^https:\/\/github\.com\/|\/$/g, '');
  return { url, repo, apply: argv.includes('--apply') };
}

export function parseTicket(text, name, status) {
  const lines = text.split(/\r?\n/);
  const h1 = lines.findIndex((l) => l.startsWith('# '));
  const id = text.match(/^\| ID \| `(TAL-\d+)` \|/m)?.[1];
  if (h1 < 0 || !id) throw new Error(`tickets/${status}/${name}.md has no title or ID`);
  const fields = { status };
  const labels = text.match(/^\| Labels \|(.*)\|\s*$/m)?.[1] ?? '';
  for (const [, scope, value] of labels.matchAll(/`(\w+)::([\w-]+)`/g)) {
    if (FIELD_KEYS.includes(scope)) fields[scope] = value;
  }
  return {
    id,
    name,
    title: `${id} ${lines[h1].slice(2).trim()}`,
    body: clean([`\`${name}\``, ...lines.slice(h1 + 1)].join('\n')),
    fields,
  };
}

export function readTickets(dir) {
  return STATUSES.flatMap((status) => {
    let files;
    try {
      files = readdirSync(join(dir, status));
    } catch {
      return [];
    }
    return files
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => parseTicket(readFileSync(join(dir, status, f), 'utf8'), f.slice(0, -3), status));
  });
}

// fields: [{ id, name, options?: [{ id, name }] }]
// items: [{ id, kind: 'draft' | 'issue' | 'pr', contentId?, repo?, closed?, title, body,
//           values: { <normalised field name>: <option name> } }]
// repo: "owner/name" to keep tickets as issues in that repository (they can take comments); drafts otherwise.
export function planSync(tickets, items, fields, repo) {
  const fieldByKey = new Map(fields.map((f) => [norm(f.name), f]));
  const newFields = [];
  const missingOptions = [];
  for (const key of FIELD_KEYS) {
    const wanted = key === 'status' ? STATUSES : [...new Set(tickets.map((t) => t.fields[key]).filter(Boolean))];
    const field = fieldByKey.get(norm(fieldName(key)));
    if (!field) {
      if (wanted.length) newFields.push({ name: fieldName(key), options: wanted.map(displayName) });
    } else if (!field.options) {
      missingOptions.push(`${field.name} is not a single select field`);
    } else {
      for (const value of wanted) {
        if (!findOption(field.options, value)) {
          missingOptions.push(`${field.name}: ${displayName(value)}`);
        }
      }
    }
  }

  const byId = new Map();
  for (const item of items) {
    const id = idOf(item.title);
    if (id && !byId.has(id)) byId.set(id, item);
  }
  const used = new Set();
  const actions = tickets.map((ticket) => {
    const item = byId.get(ticket.id);
    const fieldChanges = FIELD_KEYS.filter(
      (k) => ticket.fields[k] && !findOption([{ name: item?.values[norm(fieldName(k))] }], ticket.fields[k]),
    );
    const closed = ticket.fields.status === 'done';
    if (!item) {
      const content = ['title', 'body', ...(repo && closed ? ['closed'] : [])];
      return { kind: 'create', ticket, content, fields: fieldChanges };
    }
    used.add(item);
    // A draft becomes an issue first; after that it is edited like any issue in the repository.
    const convert = Boolean(repo) && item.kind === 'draft';
    // Issues in other repositories and pull requests keep their own title, body and state.
    const editable = item.kind === 'draft' || (item.kind === 'issue' && norm(item.repo) === norm(repo));
    const content = editable ? ['title', 'body'].filter((k) => clean(item[k]) !== clean(ticket[k])) : [];
    if ((convert || (editable && item.kind === 'issue')) && Boolean(item.closed) !== closed) content.push('closed');
    const kind = convert ? 'convert' : content.length || fieldChanges.length ? 'update' : 'same';
    return { kind, ticket, item, content, fields: fieldChanges };
  });

  return { newFields, missingOptions, actions, unmatched: items.filter((i) => !used.has(i)) };
}
