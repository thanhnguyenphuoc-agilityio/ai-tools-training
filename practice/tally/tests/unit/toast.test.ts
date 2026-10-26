import { describe, expect, it } from 'vitest';
import { dropToast, pushToast, TOAST_LIMIT, type Toast } from '../../src/toast';

// Toast queue of the confirmation messages (ui_redesign).
const toast = (id: number): Toast => ({ id, key: 'toast.expenseAdded' });

describe('toast queue', () => {
  it('adds the newest toast last', () => {
    expect(pushToast([toast(1)], toast(2)).map((t) => t.id)).toEqual([1, 2]);
  });

  it('drops the oldest toast past the limit', () => {
    let queue: Toast[] = [];
    for (let id = 1; id <= TOAST_LIMIT + 2; id++) queue = pushToast(queue, toast(id));
    expect(queue.map((t) => t.id)).toEqual([3, 4, 5]);
  });

  it('removes a dismissed toast and keeps the others', () => {
    expect(dropToast([toast(1), toast(2), toast(3)], 2).map((t) => t.id)).toEqual([1, 3]);
  });

  it('keeps the message key, not translated text, so a visible toast follows a language change', () => {
    const [stored] = pushToast([], { id: 1, key: 'toast.memberAdded', vars: { name: 'Sam' } });
    expect(stored).toEqual({ id: 1, key: 'toast.memberAdded', vars: { name: 'Sam' } });
  });
});
