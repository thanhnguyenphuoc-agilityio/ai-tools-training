// Flag shown next to each language in the language picker. Inline SVG, so it
// looks the same on every platform (Windows has no flag emoji). Typed by Locale:
// a new locale does not compile until it has a flag here.
import type { ReactNode } from 'react';
import type { Locale } from '../i18n';

const FLAGS: Record<Locale, ReactNode> = {
  vi: (
    <>
      <rect width="30" height="20" fill="#da251d" />
      <polygon
        points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15"
        fill="#ffff00"
      />
    </>
  ),
  en: (
    <>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" strokeWidth="1.5" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
      <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.5" />
    </>
  ),
};

export function Flag({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <svg className={className} width="24" height="16" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      {FLAGS[locale]}
    </svg>
  );
}
