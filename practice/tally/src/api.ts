// Typed client for the Worker API. Cookies (owner key, device token) are
// HttpOnly and sent by the browser automatically.
import type { ErrorBody, ErrorCode, ErrorParams } from '../shared/errors';
import type {
  BankDetails,
  ConfigResponse,
  CreateGroupResponse,
  GroupDto,
  MeResponse,
  MyGroupsResponse,
  NewExpense,
  UserDto,
} from '../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | undefined,
    message: string,
    public params?: ErrorParams,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<ErrorBody>;
  if (!res.ok) throw new ApiError(res.status, json.code, json.error ?? `HTTP ${res.status}`, json.params);
  return json as T;
}

const g = (code: string) => `/groups/${code}`;

export const api = {
  createGroup: (input: { name: string; ownerName: string; currency: string; roundTo: number }) =>
    call<CreateGroupResponse>('POST', '/groups', input),
  getGroup: (code: string) => call<GroupDto>('GET', g(code)),
  updateGroup: (code: string, patch: { name?: string; currency?: string; roundTo?: number }) =>
    call<{ ok: true; changed: boolean }>('PATCH', g(code), patch),
  lockGroup: (code: string) => call<{ ok: true; changed: boolean }>('POST', `${g(code)}/lock`),
  unlockGroup: (code: string) => call<{ ok: true; changed: boolean }>('DELETE', `${g(code)}/lock`),
  claimOwner: (code: string, ownerKey: string) => call('POST', `${g(code)}/owner/claim`, { ownerKey }),

  join: (code: string, name: string) => call<{ id: string }>('POST', `${g(code)}/members`, { name, claim: true }),
  addMember: (code: string, name: string) => call<{ id: string }>('POST', `${g(code)}/members`, { name }),
  claimMember: (code: string, id: string) => call('POST', `${g(code)}/members/${id}/claim`),
  updateMember: (code: string, id: string, patch: Partial<BankDetails> & { name?: string }) =>
    call('PATCH', `${g(code)}/members/${id}`, patch),
  removeMember: (code: string, id: string, reason: string) =>
    call('POST', `${g(code)}/members/${id}/remove`, { reason }),

  addExpense: (code: string, expense: NewExpense) => call<{ id: string }>('POST', `${g(code)}/expenses`, expense),
  deleteExpense: (code: string, id: string) => call('DELETE', `${g(code)}/expenses/${id}`),

  recordTransfer: (code: string, toId: string, amount: number) =>
    call<{ id: string }>('POST', `${g(code)}/transfers`, { toId, amount }),
  confirmTransfer: (code: string, id: string) => call('POST', `${g(code)}/transfers/${id}/confirm`),

  getConfig: () => call<ConfigResponse>('GET', '/config'),
  getMe: () => call<MeResponse>('GET', '/me'),
  updateMe: (patch: BankDetails) => call<{ user: UserDto }>('PATCH', '/me', patch),
  signInGoogle: (credential: string) => call<{ user: UserDto }>('POST', '/auth/google', { credential }),
  signInDev: (email: string, name?: string) => call<{ user: UserDto }>('POST', '/auth/dev', { email, name }),
  signOut: () => call<{ ok: true }>('POST', '/auth/logout'),
  linkAccount: (code: string) => call<{ ok: true; changed: boolean }>('POST', `${g(code)}/link`),
  getMyGroups: () => call<MyGroupsResponse>('GET', '/me/groups'),
};
