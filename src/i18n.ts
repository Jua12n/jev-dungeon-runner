export type Lang = 'en' | 'es';

const STORAGE_KEY = 'jev-dungeon-runner-lang';

export function getLanguage(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'es' ? 'es' : 'en';
}

export function pick(en: string, es: string): string {
  return getLanguage() === 'es' ? es : en;
}

export function setLanguage(lang: Lang): void {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyStaticTranslations();
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
}

export function initializeI18n(): void {
  document.querySelector<HTMLButtonElement>('#lang-en-btn')?.addEventListener('click', () => setLanguage('en'));
  document.querySelector<HTMLButtonElement>('#lang-es-btn')?.addEventListener('click', () => setLanguage('es'));
  applyStaticTranslations();
}

export function applyStaticTranslations(): void {
  const lang = getLanguage();
  document.documentElement.lang = lang;

  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-en]')) {
    const value = element.dataset[lang === 'es' ? 'i18nEs' : 'i18nEn'];
    if (value) {
      element.textContent = value;
    }
  }

  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-html-en]')) {
    const value = element.dataset[lang === 'es' ? 'i18nHtmlEs' : 'i18nHtmlEn'];
    if (value) {
      element.innerHTML = value;
    }
  }

  const enButton = document.querySelector<HTMLElement>('#lang-en-btn');
  const esButton = document.querySelector<HTMLElement>('#lang-es-btn');
  enButton?.classList.toggle('is-active', lang === 'en');
  esButton?.classList.toggle('is-active', lang === 'es');
}
