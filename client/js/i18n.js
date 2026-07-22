// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Minimal i18n: loads a locale JSON and applies it to any element tagged
// with data-i18n (text content) or data-i18n-placeholder (placeholder attr).
const I18N = (() => {
  let dict = {};
  let currentLang = "en";
  const listeners = [];

  async function setLang(lang) {
    const res = await fetch(`/static/locales/${lang}.json`);
    dict = await res.json();
    currentLang = lang;
    document.documentElement.lang = lang;
    applyToDom();
    listeners.forEach((fn) => fn());
  }

  function t(key, vars) {
    let str = dict[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, v);
      });
    }
    return str;
  }

  function applyToDom() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function lang() {
    return currentLang;
  }

  return { setLang, t, onChange, lang };
})();
