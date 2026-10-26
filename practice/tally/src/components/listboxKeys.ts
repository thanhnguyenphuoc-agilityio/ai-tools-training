// Keyboard rules of the language menu, kept free of React and the DOM so they
// can be unit tested in Node. Same keys as a native select list.

/** Index of the active option after a key press, or null when the key does not move it. */
export function nextActiveIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
