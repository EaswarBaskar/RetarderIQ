// Locale loader. Keeping messages in separate JSON files avoids shipping all
// six 500+ key dictionaries to every technician on first load.
const LANG = Object.create(null);
const SUPPORTED_LANGUAGES = ['en', 'ta', 'ml', 'hi', 'te', 'kn'];
const LANGUAGE_BASE = '/data/languages/';
const LANGUAGE_NAMES = { en: 'English', ta: 'Tamil', ml: 'Malayalam', hi: 'Hindi', te: 'Telugu', kn: 'Kannada' };
let CURRENT_LANG = normaliseLanguage(window.localStorage?.getItem('riq_language') || 'en');
let LANG_LOCKED = false;
let languageReady = Promise.resolve();

function normaliseLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
}

async function loadLanguage(lang) {
  const locale = normaliseLanguage(lang);
  if (LANG[locale]) return LANG[locale];
  try {
    const response = await fetch(`${LANGUAGE_BASE}${locale}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Locale ${locale} returned ${response.status}`);
    LANG[locale] = await response.json();
  } catch (error) {
    console.warn(`[Language] Could not load ${locale}; using English fallback.`, error);
    if (locale !== 'en') return loadLanguage('en');
    LANG.en = {};
  }
  return LANG[locale];
}

function setLanguage(lang) {
  CURRENT_LANG = normaliseLanguage(lang);
  try { window.localStorage.setItem('riq_language', CURRENT_LANG); } catch (_) {}
  languageReady = loadLanguage(CURRENT_LANG).then(() => applyLanguage());
  return languageReady;
}

function confirmLanguageChoice(langCode) {
  return setLanguage(langCode);
}

function resetLanguageLock() {
  LANG_LOCKED = false;
}

function getLang() {
  return CURRENT_LANG || 'en';
}

function getLanguageName(lang = getLang()) {
  return LANGUAGE_NAMES[normaliseLanguage(lang)] || 'English';
}

function lookupMessage(messages, key) {
  if (!messages) return undefined;
  const normalizedKey = typeof key === 'string' ? key.replace(/’/g, "'") : key;
  return messages[key] || messages[normalizedKey];
}

function t(key) {
  if (!key) return key;
  return lookupMessage(LANG[getLang()], key) || lookupMessage(LANG.en, key) || key;
}

function tr(lang, key) {
  if (!key) return key;
  return lookupMessage(LANG[normaliseLanguage(lang)], key) || lookupMessage(LANG.en, key) || key;
}

function bi(key) {
  return tr(getLang(), key);
}

function applyLanguage() {
  document.querySelectorAll('.lang-select').forEach(select => { select.value = getLang(); });
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const translated = t(element.getAttribute('data-i18n'));
    if (element.hasAttribute('data-i18n-placeholder')) element.setAttribute('placeholder', translated);
    else if (element.hasAttribute('data-i18n-aria')) element.setAttribute('aria-label', translated);
    else if (element.tagName === 'INPUT' && element.type === 'checkbox') {
      const label = element.nextElementSibling;
      if (label) label.innerHTML = translated;
    } else if (element.tagName === 'BUTTON' || element.tagName === 'OPTION') element.textContent = translated;
    else element.innerHTML = translated;
  });
  if (typeof window.refreshWizardStep === 'function') window.refreshWizardStep();
  if (typeof window.refreshTmlStep === 'function') window.refreshTmlStep();
  if (typeof window.refreshTmlReport === 'function') window.refreshTmlReport();
  if (typeof window.refreshGeneratedReport === 'function') window.refreshGeneratedReport();
  if (typeof window.refreshDiagnosticFeedback === 'function') window.refreshDiagnosticFeedback();
}

window.languageReady = languageReady = Promise.all([loadLanguage('en'), loadLanguage(CURRENT_LANG)])
  .then(() => applyLanguage());
window.setLanguage = setLanguage;
window.confirmLanguageChoice = confirmLanguageChoice;
window.resetLanguageLock = resetLanguageLock;
window.getLanguageName = getLanguageName;
window.languageReady = languageReady;
document.addEventListener('DOMContentLoaded', () => languageReady.then(applyLanguage));
