import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  isThemePreference,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from './theme';

describe('appearance preference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('offers exactly light, dark and system', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['light', 'dark', 'system']);
  });

  it('resolves an explicit choice to itself', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('resolves "system" from the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('rejects anything that is not a real preference', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('midnight')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it('round-trips the preference through storage', () => {
    writeStoredTheme('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('falls back to the default when storage holds nothing usable', () => {
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });

  it('applies the resolved theme to the document, which is what the CSS keys off', () => {
    applyResolvedTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyResolvedTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
