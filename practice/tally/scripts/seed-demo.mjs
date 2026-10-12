// Creates a demo group with fake people and expenses through the API.
// Usage: npm run dev (in another terminal), then: npm run seed [baseUrl]
const base = process.argv[2] ?? 'http://localhost:5173';
const cookies = [];

async function call(method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: cookies.join('; ') },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie()) cookies.push(c.split(';')[0]);
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.code} ${json.error}`);
  return json;
}

const { code, ownerKey } = await call('POST', '/groups', {
  name: 'Weekend trip (demo)',
  ownerName: 'Alex',
  currency: 'VND',
  roundTo: 1000,
});
const g = `/groups/${code}`;

const ids = { Alex: (await call('GET', g)).members[0].id };
for (const name of ['Sam', 'Jamie', 'Morgan', 'Riley', 'Casey']) ids[name] = (await call('POST', `${g}/members`, { name })).id;

// Fake account numbers only.
await call('PATCH', `${g}/members/${ids.Alex}`, { bankBin: '970436', accountNo: '0123456789', accountName: 'ALEX KIM' });
await call('PATCH', `${g}/members/${ids.Sam}`, { bankBin: '970422', accountNo: '9876543210', accountName: 'SAM TAYLOR' });

const everyone = Object.values(ids).map((memberId) => ({ memberId, weight: 1 }));
// Calendar dates in the local time zone of the machine running the seed, like the expense form.
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const expenses = [
  { payerId: ids.Alex, amount: 240_000, description: 'Hotel, 2 nights', spentOn: day(6), splitMode: 'equal', participants: everyone },
  { payerId: ids.Sam, amount: 285_000, description: 'Taxi from the airport', spentOn: day(6), splitMode: 'equal', participants: everyone },
  { payerId: ids.Jamie, amount: 72_000, description: 'Water', spentOn: day(6), splitMode: 'equal', participants: everyone },
  {
    payerId: ids.Alex,
    amount: 465_500,
    description: 'Dinner, first night',
    spentOn: day(5),
    splitMode: 'weight',
    participants: everyone.map((p) => ({ ...p, weight: p.memberId === ids.Riley || p.memberId === ids.Jamie ? 0.8 : 1 })),
  },
];
for (const e of expenses) await call('POST', `${g}/expenses`, e);

console.log(`Group:          ${base}/g/${code}`);
console.log(`Owner recovery: ${base}/g/${code}#owner=${ownerKey}`);
