// Mirrors the ticket board onto a GitHub Projects (v2) board. The repository is the source of truth: each ticket
// becomes an item titled "TAL-<n> <title>", and its folder and labels fill the Status, Ticket type, Priority and
// Area fields. With --repo the items are issues in that GitHub repository, so people can comment on them, and a
// ticket in done/ closes its issue; without it they are draft items. Title, body, state and those fields are
// overwritten from the ticket; comments are left alone and nothing is ever deleted.
// Usage: GITHUB_TOKEN=<token> npm run board:sync -- <project url> [--repo <owner>/<name>] [--apply]
// The token needs the project scope, plus repo (or public_repo) with --repo. The project URL and repository can
// also come from TALLY_BOARD_URL and TALLY_BOARD_REPO. Without --apply the script only prints the plan.
import { fileURLToPath } from 'node:url';
import { FIELD_KEYS, fieldName, findOption, norm, parseArgs, planSync, readTickets } from './board-sync/tickets.mjs';

const { url, repo, apply } = parseArgs(process.argv.slice(2), process.env);
const token = process.env.GITHUB_TOKEN;
const match = url?.match(/github\.com\/(users|orgs)\/([^/]+)\/projects\/(\d+)/);
if (!match)
  throw new Error('Pass the project URL (https://github.com/users/<login>/projects/<n>) or set TALLY_BOARD_URL');
if (repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('--repo takes <owner>/<name>');
if (!token) throw new Error('Set GITHUB_TOKEN to a token with the project scope');
const [, ownerKind, login, number] = match;

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub: ${res.status} ${JSON.stringify(json.errors ?? json.message)}`);
  return json.data;
}

const owner = ownerKind === 'users' ? 'user' : 'organization';
const FIELDS = `fields(first: 50) { nodes {
  ... on ProjectV2FieldCommon { id name }
  ... on ProjectV2SingleSelectField { options { id name } } } }`;

async function loadProject() {
  const items = [];
  let project;
  let after = null;
  do {
    const data = await gql(
      `query($login: String!, $number: Int!, $after: String) { ${owner}(login: $login) { projectV2(number: $number) {
        id title ${FIELDS}
        items(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id
          content {
            ... on DraftIssue { id title body }
            ... on Issue { id title body closed repository { nameWithOwner } }
            ... on PullRequest { title body } }
          fieldValues(first: 20) { nodes { ... on ProjectV2ItemFieldSingleSelectValue {
            name field { ... on ProjectV2FieldCommon { name } } } } } } } } } }`,
      { login, number: Number(number), after },
    );
    project = data[owner]?.projectV2;
    if (!project) throw new Error(`Project ${url} not found or not visible to this token`);
    for (const node of project.items.nodes) {
      const values = {};
      for (const v of node.fieldValues.nodes) if (v.field) values[norm(v.field.name)] = v.name;
      const c = node.content ?? {};
      const kind = c.repository ? 'issue' : c.id ? 'draft' : 'pr';
      items.push({
        id: node.id,
        kind,
        contentId: c.id,
        repo: c.repository?.nameWithOwner,
        closed: c.closed,
        title: c.title ?? '',
        body: c.body ?? '',
        values,
      });
    }
    after = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (after);
  return { id: project.id, title: project.title, fields: project.fields.nodes.filter((f) => f.id), items };
}

async function loadRepositoryId() {
  if (!repo) return undefined;
  const [repoOwner, name] = repo.split('/');
  const data = await gql(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id hasIssuesEnabled } }`,
    { owner: repoOwner, name },
  );
  if (!data.repository?.hasIssuesEnabled) throw new Error(`${repo} does not exist or has issues turned off`);
  return data.repository.id;
}

const tickets = readTickets(fileURLToPath(new URL('../tickets', import.meta.url)));
const project = await loadProject();
const repositoryId = await loadRepositoryId();
const plan = planSync(tickets, project.items, project.fields, repo);

console.log(`${project.title}: ${tickets.length} tickets, ${project.items.length} board items`);
if (repo) console.log(`Items are issues in ${repo}`);
for (const f of plan.newFields) console.log(`new field  ${f.name}: ${f.options.join(', ')}`);
for (const m of plan.missingOptions) console.log(`MISSING    ${m} (add this option on GitHub, then run again)`);
for (const a of plan.actions) {
  if (a.kind === 'same') continue;
  const what = [...a.content, ...a.fields.map((k) => `${k}=${a.ticket.fields[k]}`)].join(', ');
  console.log(`${a.kind.padEnd(10)} ${a.ticket.title}  (${what})`);
}
for (const i of plan.unmatched) console.log(`not in repo ${i.title} (left as is)`);
const counts = Object.groupBy(plan.actions, (a) => a.kind);
console.log(['create', 'convert', 'update', 'same'].map((k) => `${k} ${counts[k]?.length ?? 0}`).join(', '));

if (!apply) {
  console.log('Dry run. Add --apply to change the board.');
  process.exit(0);
}
if (plan.missingOptions.length) throw new Error('Add the missing options on GitHub first');

for (const f of plan.newFields) {
  await gql(
    `mutation($projectId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
      createProjectV2Field(input: { projectId: $projectId, dataType: SINGLE_SELECT, name: $name,
        singleSelectOptions: $options }) { clientMutationId } }`,
    {
      projectId: project.id,
      name: f.name,
      options: f.options.map((name) => ({ name, color: 'GRAY', description: '' })),
    },
  );
}
const fields = plan.newFields.length ? (await loadProject()).fields : project.fields;
const fieldByKey = new Map(fields.map((f) => [norm(f.name), f]));

for (const a of plan.actions) {
  if (a.kind === 'same') continue;
  const { title, body } = a.ticket;
  let itemId = a.item?.id;
  // The issue (or draft) whose title, body and state follow the ticket.
  let contentId = a.item?.contentId;
  let isIssue = a.item?.kind === 'issue';
  if (a.kind === 'create' && repo) {
    const data = await gql(
      `mutation($repositoryId: ID!, $title: String!, $body: String) {
        createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) { issue { id } } }`,
      { repositoryId, title, body },
    );
    contentId = data.createIssue.issue.id;
    isIssue = true;
    const added = await gql(
      `mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }`,
      { projectId: project.id, contentId },
    );
    itemId = added.addProjectV2ItemById.item.id;
  } else if (a.kind === 'create') {
    const data = await gql(
      `mutation($projectId: ID!, $title: String!, $body: String) {
        addProjectV2DraftIssue(input: { projectId: $projectId, title: $title, body: $body }) { projectItem { id } } }`,
      { projectId: project.id, title, body },
    );
    itemId = data.addProjectV2DraftIssue.projectItem.id;
  } else if (a.kind === 'convert') {
    const data = await gql(
      `mutation($itemId: ID!, $repositoryId: ID!) {
        convertProjectV2DraftIssueItemToIssue(input: { itemId: $itemId, repositoryId: $repositoryId }) {
          item { id content { ... on Issue { id } } } } }`,
      { itemId, repositoryId },
    );
    itemId = data.convertProjectV2DraftIssueItemToIssue.item.id;
    contentId = data.convertProjectV2DraftIssueItemToIssue.item.content.id;
    isIssue = true;
  }
  const edit = a.content.filter((k) => k !== 'closed');
  if (a.kind !== 'create' && edit.length && isIssue) {
    await gql(
      `mutation($id: ID!, $title: String!, $body: String) {
        updateIssue(input: { id: $id, title: $title, body: $body }) { clientMutationId } }`,
      { id: contentId, title, body },
    );
  } else if (a.kind !== 'create' && edit.length) {
    await gql(
      `mutation($id: ID!, $title: String!, $body: String) {
        updateProjectV2DraftIssue(input: { draftIssueId: $id, title: $title, body: $body }) { clientMutationId } }`,
      { id: contentId, title, body },
    );
  }
  if (a.content.includes('closed')) {
    const closed = a.ticket.fields.status === 'done';
    const mutation = closed ? 'closeIssue' : 'reopenIssue';
    try {
      await gql(`mutation($id: ID!) { ${mutation}(input: { issueId: $id }) { clientMutationId } }`, { id: contentId });
    } catch (error) {
      // GitHub sometimes reports "Could not close the issue" for a just-converted issue although the close went
      // through; only a state that is still wrong is an error.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const data = await gql(`query($id: ID!) { node(id: $id) { ... on Issue { closed } } }`, { id: contentId });
      if (data.node?.closed !== closed) throw error;
    }
  }
  for (const key of FIELD_KEYS.filter((k) => a.fields.includes(k))) {
    const field = fieldByKey.get(norm(fieldName(key)));
    const option = findOption(field.options, a.ticket.fields[key]);
    await gql(
      `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
          value: { singleSelectOptionId: $optionId } }) { clientMutationId } }`,
      { projectId: project.id, itemId, fieldId: field.id, optionId: option.id },
    );
  }
  console.log(`done       ${title}`);
}
