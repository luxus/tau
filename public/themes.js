/**
 * Theme system — dark / light mode only
 */

export const themes = {
  dark: {
    name: 'Dark',
    dark: true,
    vars: {},  // Dark is the CSS default, no overrides needed
  },
  light: {
    name: 'Light',
    dark: false,
    vars: {},  // Light mode uses [data-theme="light"] in CSS
  },
};

export function applyTheme(themeId) {
  const root = document.documentElement;
  if (themeId === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  localStorage.setItem('tau-theme', themeId);
}

export function getCurrentTheme() {
  const saved = localStorage.getItem('tau-theme');
  if (saved) return saved;
  // Auto-detect from OS
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

// Listen for OS theme changes if no explicit preference saved
if (!localStorage.getItem('tau-theme')) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!localStorage.getItem('tau-theme')) {
      const root = document.documentElement;
      if (e.matches) {
        root.setAttribute('data-theme', 'light');
      } else {
        root.removeAttribute('data-theme');
      }
    }
  });
}
