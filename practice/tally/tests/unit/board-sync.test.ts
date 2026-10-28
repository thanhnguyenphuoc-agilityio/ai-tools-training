import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STATUSES, parseArgs, parseTicket, planSync, readTickets } from '../../scripts/board-sync/tickets.mjs';

const ticket = (id: string, status: string, labels = '`type::bug`, `priority::high`, `area::ui`') =>
  parseTicket(
    `# Broken button\n\n| Field | Value |\n|---|---|\n| ID | \`${id}\` |\n| Labels | ${labels} |\n\n## Description\n\nIt breaks.\n`,
    'broken_button',
    status,
  );

const option = (name: string) => ({ id: `opt-${name}`, name });
const fullFields = [
  { id: 'f1', name: 'Status', options: STATUSES.map(option) },
  { id: 'f2', name: 'Ticket type', options: ['Bug', 'Feature'].map(option) },
  { id: 'f3', name: 'Priority', options: ['High', 'Low'].map(option) },
  { id: 'f4', name: 'Area', options: ['UI'].map(option) },
];

describe('parseTicket', () => {
  it('reads the ID, title, folder and scoped labels', () => {
    const t = ticket('TAL-7', 'todo', '`type::bug`, `priority::high`, `area::ui`, `source::seeded`');
    expect(t.title).toBe('TAL-7 Broken button');
    expect(t.fields).toEqual({ status: 'todo', type: 'bug', priority: 'high', area: 'ui' });
    expect(t.body.startsWith('`broken_button`')).toBe(true);
    expect(t.body).toContain('It breaks.');
  });

  it('rejects a ticket without an ID', () => {
    expect(() => parseTicket('# No id\n', 'no_id', 'todo')).toThrow('no title or ID');
  });

  it('parses every ticket on the real board', () => {
    const all = readTickets(fileURLToPath(new URL('../../tickets', import.meta.url)));
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
  });
});

describe('planSync', () => {
  it('creates missing items and proposes fields the board lacks', () => {
    const plan = planSync([ticket('TAL-1', 'todo')], [], [{ id: 'f1', name: 'Status', options: [option('Todo')] }]);
    expect(plan.actions.map((a) => a.kind)).toEqual(['create']);
    expect(plan.newFields.map((f) => f.name)).toEqual(['Ticket type', 'Priority', 'Area']);
    expect(plan.missingOptions).toContain('Status: Backlog');
    expect(plan.missingOptions).not.toContain('Status: Todo');
  });

  it('matches items by ID, ignores case and dashes, and leaves unknown items alone', () => {
    const t = ticket('TAL-2', 'in-progress');
    const same = {
      id: 'i1',
      kind: 'draft' as const,
      title: t.title,
      body: t.body,
      values: { status: 'In Progress', tickettype: 'Bug', priority: 'High', area: 'UI' },
    };
    const other = { id: 'i2', kind: 'draft' as const, title: 'Notes', body: '', values: {} };
    const plan = planSync([t], [same, other], fullFields);
    expect(plan.actions.map((a) => a.kind)).toEqual(['same']);
    expect(plan.unmatched).toEqual([other]);
    expect(plan.missingOptions).toEqual([]);
  });

  it('maps ready-to-review and priorities to the default GitHub template options', () => {
    const fields = [
      {
        id: 'f1',
        name: 'Status',
        options: ['Backlog', 'Todo', 'In progress', 'Waiting To Merge', 'In review', 'Done'].map(option),
      },
      { id: 'f3', name: 'Priority', options: ['P0', 'P1', 'P2'].map(option) },
      ...fullFields.filter((f) => f.name === 'Ticket type' || f.name === 'Area'),
    ];
    const t = ticket('TAL-4', 'ready-to-review');
    const item = {
      id: 'i1',
      title: t.title,
      values: { status: 'In review', tickettype: 'Bug', priority: 'P0', area: 'UI' },
    };
    const plan = planSync([t], [{ ...item, kind: 'draft' as const, body: t.body }], fields);
    expect(plan.missingOptions).toEqual([]);
    expect(plan.actions[0].kind).toBe('same');
  });

  it('updates a moved ticket and edits only draft content', () => {
    const t = ticket('TAL-3', 'done');
    const values = { status: 'Todo', tickettype: 'Bug', priority: 'High', area: 'UI' };
    const draft = planSync(
      [t],
      [{ id: 'i1', kind: 'draft' as const, title: 'TAL-3 Old title', body: t.body, values }],
      fullFields,
    );
    expect(draft.actions[0]).toMatchObject({ kind: 'update', content: ['title'], fields: ['status'] });
    const pr = planSync([t], [{ id: 'i1', kind: 'pr', title: 'TAL-3 Old title', body: '', values }], fullFields);
    expect(pr.actions[0]).toMatchObject({ kind: 'update', content: [], fields: ['status'] });
  });

  it('keeps tickets as issues in the given repository and closes them in done', () => {
    const repo = 'alex/board';
    const values = { status: 'Done', tickettype: 'Bug', priority: 'High', area: 'UI' };
    const t = ticket('TAL-5', 'done');
    const draft = { id: 'i1', kind: 'draft' as const, contentId: 'd1', title: t.title, body: t.body, values };
    expect(planSync([t], [draft], fullFields, repo).actions[0]).toMatchObject({ kind: 'convert', content: ['closed'] });
    expect(planSync([t], [], fullFields, repo).actions[0].content).toEqual(['title', 'body', 'closed']);

    const issue = { ...draft, kind: 'issue' as const, repo, closed: true };
    expect(planSync([t], [issue], fullFields, repo).actions[0].kind).toBe('same');
    const reopened = ticket('TAL-5', 'todo');
    expect(planSync([reopened], [issue], fullFields, repo).actions[0]).toMatchObject({
      kind: 'update',
      content: ['closed'],
      fields: ['status'],
    });
    const foreign = { ...issue, repo: 'sam/other', title: 'TAL-5 Their title', closed: false };
    expect(planSync([t], [foreign], fullFields, repo).actions[0]).toMatchObject({ kind: 'same', content: [] });
  });
});

describe('parseArgs', () => {
  const url = 'https://github.com/users/alex/projects/1';

  it('reads the project URL without --repo', () => {
    expect(parseArgs([url], {})).toEqual({ url, repo: undefined, apply: false });
  });

  it('reads --repo and --apply in any order', () => {
    expect(parseArgs([url, '--repo', 'a/b'], {})).toEqual({ url, repo: 'a/b', apply: false });
    expect(parseArgs(['--repo', 'https://github.com/a/b/', url, '--apply'], {})).toEqual({
      url,
      repo: 'a/b',
      apply: true,
    });
    expect(parseArgs(['--apply', url], {})).toEqual({ url, repo: undefined, apply: true });
  });

  it('falls back to TALLY_BOARD_URL and TALLY_BOARD_REPO', () => {
    expect(parseArgs([], { TALLY_BOARD_URL: url, TALLY_BOARD_REPO: 'a/b' })).toEqual({
      url,
      repo: 'a/b',
      apply: false,
    });
    expect(parseArgs([url, '--repo', 'c/d'], { TALLY_BOARD_URL: 'x', TALLY_BOARD_REPO: 'a/b' }).repo).toBe('c/d');
  });

  it('stops when npm took --repo as its own option', () => {
    expect(() => parseArgs([url, 'a/b'], { npm_config_repo: 'true' })).toThrow('node scripts/sync-board.mjs');
  });

  it('rejects --repo without a value', () => {
    expect(() => parseArgs([url, '--repo'], {})).toThrow('--repo');
    expect(() => parseArgs(['--repo', '--apply', url], {})).toThrow('--repo');
  });
});
