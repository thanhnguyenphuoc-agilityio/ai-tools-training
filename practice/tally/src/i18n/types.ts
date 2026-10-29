import type { AmountInputRules } from '../../shared/money';
import type { en } from './locales/en';

/** A plural message. Only "other" is required; languages use different categories. */
export type PluralMessage = Partial<Record<Exclude<Intl.LDMLPluralRule, 'other'>, string>> & { other: string };

/** Same shape as the English messages, with every leaf widened to string. */
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends { other: string } ? PluralMessage : Widen<T[K]>;
};
export type Messages = Widen<typeof en>;

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`;

/** Every dot path to a string, e.g. "home.create.title". */
export type MessageKey<T = Messages, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, K> : MessageKey<T[K], Join<P, K>>;
}[keyof T & string];

/** Dot paths to plural nodes ({ one?, other }), e.g. "expenseList.people". */
export type PluralKey<T = Messages, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends { other: string }
      ? Join<P, K>
      : PluralKey<T[K], Join<P, K>>;
}[keyof T & string];

export type Vars = Record<string, string | number>;

/** A variable whose own text is a message, so it is translated when rendered too. */
export interface MessageVar {
  key: MessageKey;
  vars?: Vars;
}

/** Variables of a stored message; a value can itself be a message (for example a list of examples). */
export type MessageVars = Record<string, string | number | MessageVar>;

/**
 * A message kept in component state: translated when rendered, so it follows a language change.
 * Either a message key (with its variables, and optionally an error for its `{message}` placeholder) or an error.
 */
export type UiMessage =
  { key: MessageKey; vars?: MessageVars; error?: unknown } | { key?: undefined; vars?: never; error: unknown };

export interface LocaleBundle {
  /** BCP 47 tag used for Intl formatting. */
  intl: string;
  /** Name of the language in itself, for a language picker. */
  label: string;
  messages: Messages;
  amountInput: AmountInputRules;
  /** Suggested currency for new groups; the group owner can pick another. */
  defaultCurrency: string;
}
