import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api';
import { createTranslator, type UiMessage } from '../../src/i18n';
import { enLocale } from '../../src/i18n/locales/en';
import { viLocale } from '../../src/i18n/locales/vi';

describe('UiMessage translation', () => {
  const vi = createTranslator('vi');
  const en = createTranslator('en');

  it('translates a key with variables in both languages', () => {
    const m: UiMessage = { key: 'home.history.remove', vars: { name: 'Alex' } };
    expect(vi.message(m)).toBe(viLocale.messages.home.history.remove.replace('{name}', 'Alex'));
    expect(en.message(m)).toBe(enLocale.messages.home.history.remove.replace('{name}', 'Alex'));
  });

  it('translates an ApiError with a known code and params in both languages', () => {
    const m: UiMessage = { error: new ApiError(400, 'FIELD_TOO_LONG', 'too long', { max: 40 }) };
    expect(vi.message(m)).toBe(viLocale.messages.errors.FIELD_TOO_LONG.replace('{max}', '40'));
    expect(en.message(m)).toBe(enLocale.messages.errors.FIELD_TOO_LONG.replace('{max}', '40'));
  });

  it('translates a TypeError to common.networkError in both languages', () => {
    const m: UiMessage = { error: new TypeError('Failed to fetch') };
    expect(vi.message(m)).toBe(viLocale.messages.common.networkError);
    expect(en.message(m)).toBe(enLocale.messages.common.networkError);
  });

  it('translates a key plus error, with the nested error sentence, in both languages', () => {
    const m: UiMessage = { key: 'group.badRecoveryLink', error: new ApiError(403, 'WRONG_OWNER_KEY', 'wrong key') };
    expect(vi.message(m)).toBe(
      viLocale.messages.group.badRecoveryLink.replace('{message}', viLocale.messages.errors.WRONG_OWNER_KEY),
    );
    expect(en.message(m)).toBe(
      enLocale.messages.group.badRecoveryLink.replace('{message}', enLocale.messages.errors.WRONG_OWNER_KEY),
    );
  });

  it('translates a variable that is itself a message, so no part keeps the old language', () => {
    // ExpenseForm stores the amount examples as a message, not as text translated when the error was set.
    const m: UiMessage = {
      key: 'expenseForm.invalidAmount',
      vars: { examples: { key: 'expenseForm.amountExamples' } },
    };
    const sentence = (bundle: typeof viLocale) =>
      bundle.messages.expenseForm.invalidAmount.replace('{examples}', bundle.messages.expenseForm.amountExamples);
    expect(vi.message(m)).toBe(sentence(viLocale));
    expect(en.message(m)).toBe(sentence(enLocale));
    expect(vi.message(m)).not.toBe(en.message(m));
  });

  it('translates a message variable that has variables of its own', () => {
    const m: UiMessage = { key: 'home.history.remove', vars: { name: { key: 'common.unknownMember' } } };
    const sentence = (bundle: typeof viLocale) =>
      bundle.messages.home.history.remove.replace('{name}', bundle.messages.common.unknownMember);
    expect(vi.message(m)).toBe(sentence(viLocale));
    expect(en.message(m)).toBe(sentence(enLocale));
  });
});
