/**
 * La Bellota Co. — main.js
 * Handles: i18n language switching, nav behaviour,
 *          tab switching, form submission stub, scroll reveals
 */

/* ===================================================
   i18n Engine
   =================================================== */
let i18nData = null;
let currentLang = 'en';

const SUPPORTED_LANGS = ['en', 'es', 'ru'];
const FUTURE_LANGS   = ['zh', 'fr', 'de', 'uk', 'ko', 'ja'];
const ALL_LANGS      = [...SUPPORTED_LANGS, ...FUTURE_LANGS];

const LANG_LABELS = {
  en: 'English',
  es: 'Español',
  ru: 'Русский',
  zh: '中文',
  fr: 'Français',
  de: 'Deutsch',
  uk: 'Українська',
  ko: '한국어',
  ja: '日本語',
};

async function loadI18n() {
  const resp = await fetch('i18n.json');
  i18nData = await resp.json();
}

function t(key) {
  const dict = i18nData[currentLang];
  if (!dict) return i18nData.en[key] || key;
  if (dict._fallback) return i18nData[dict._fallback]?.[key] || key;
  return dict[key] || i18nData.en[key] || key;
}

function applyTranslations() {
  document.documentElement.lang = currentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.type !== 'submit') el.placeholder = val;
    } else if (el.tagName === 'OPTION') {
      el.textContent = val;
    } else {
      el.textContent = val;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
    el.setAttribute('data-tooltip', t(el.dataset.i18nTooltip));
  });

  /* Hero title: split on \n for the animated lines */
  const heroTitle = document.getElementById('hero-title');
  if (heroTitle) {
    const raw = t('hero_title');
    const lines = raw.split('\n');
    heroTitle.innerHTML = lines.map(line =>
      `<span class="line"><span class="line-inner">${line}</span></span>`
    ).join('');
  }

  /* Update lang switcher active state */
  document.querySelectorAll('.lang-option').forEach(btn => {
    const lang = btn.dataset.lang;
    btn.classList.toggle('active', lang === currentLang);
  });

  /* Update current lang button label */
  const langBtnLabel = document.getElementById('lang-current');
  if (langBtnLabel) langBtnLabel.textContent = LANG_LABELS[currentLang];

  /* Update mobile lang switcher active state */
  document.querySelectorAll('#mobile-lang-switcher button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });

  /* Update page <title> */
  document.title = currentLang === 'ru'
    ? 'La Bellota Co. — Испанские Деликатесы'
    : currentLang === 'es'
      ? 'La Bellota Co. — Delicias Españolas Auténticas'
      : 'La Bellota Co. — Authentic Spanish Delicacies';
}

function setLang(lang) {
  if (!ALL_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('lb_lang', lang);
  applyTranslations();
  closeLangDropdown();
}

/* ===================================================
   Language Switcher UI
   =================================================== */
let langDropdownOpen = false;

function buildLangSwitcher() {
  const dropdown = document.getElementById('lang-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  /* Active languages group */
  const labelFull = document.createElement('div');
  labelFull.className = 'lang-group-label';
  labelFull.textContent = 'Available';
  dropdown.appendChild(labelFull);

  SUPPORTED_LANGS.forEach(lang => {
    const btn = document.createElement('button');
    btn.className = 'lang-option';
    btn.dataset.lang = lang;
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `<span>${LANG_LABELS[lang]}</span>`;
    btn.addEventListener('click', () => setLang(lang));
    dropdown.appendChild(btn);
  });

  /* Future languages group */
  const labelSoon = document.createElement('div');
  labelSoon.className = 'lang-group-label';
  labelSoon.textContent = 'Coming soon';
  dropdown.appendChild(labelSoon);

  FUTURE_LANGS.forEach(lang => {
    const btn = document.createElement('button');
    btn.className = 'lang-option inactive';
    btn.dataset.lang = lang;
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `<span>${LANG_LABELS[lang]}</span><span class="lang-badge">EN</span>`;
    btn.addEventListener('click', () => setLang(lang));
    dropdown.appendChild(btn);
  });

  /* Mobile lang switcher — all languages as compact buttons */
  const mobileSwitcher = document.getElementById('mobile-lang-switcher');
  if (mobileSwitcher) {
    mobileSwitcher.innerHTML = '';
    ALL_LANGS.forEach(lang => {
      const btn = document.createElement('button');
      btn.dataset.lang = lang;
      btn.textContent = LANG_LABELS[lang];
      btn.classList.toggle('active', lang === currentLang);
      btn.addEventListener('click', () => {
        setLang(lang);
        document.querySelectorAll('#mobile-lang-switcher button').forEach(b =>
          b.classList.toggle('active', b.dataset.lang === currentLang)
        );
      });
      mobileSwitcher.appendChild(btn);
    });
  }
}

function openLangDropdown() {
  const dropdown = document.getElementById('lang-dropdown');
  const btn = document.getElementById('lang-btn');
  if (!dropdown) return;
  dropdown.classList.add('open');
  dropdown.setAttribute('aria-hidden', 'false');
  btn?.setAttribute('aria-expanded', 'true');
  langDropdownOpen = true;
}

function closeLangDropdown() {
  const dropdown = document.getElementById('lang-dropdown');
  const btn = document.getElementById('lang-btn');
  if (!dropdown) return;
  dropdown.classList.remove('open');
  dropdown.setAttribute('aria-hidden', 'true');
  btn?.setAttribute('aria-expanded', 'false');
  langDropdownOpen = false;
}

function toggleLangDropdown() {
  langDropdownOpen ? closeLangDropdown() : openLangDropdown();
}

/* ===================================================
   Navigation
   =================================================== */
function initNav() {
  const nav = document.querySelector('.nav');
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');

  /* Scroll shadow */
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  /* Hamburger */
  hamburger?.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    mobileNav?.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  /* Close mobile nav on link click */
  mobileNav?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('open');
      hamburger?.setAttribute('aria-expanded', 'false');
      mobileNav.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  /* Lang switcher toggle */
  const langBtn = document.getElementById('lang-btn');
  langBtn?.addEventListener('click', e => {
    e.stopPropagation();
    toggleLangDropdown();
  });

  /* Close dropdown on outside click */
  document.addEventListener('click', () => closeLangDropdown());
  document.getElementById('lang-dropdown')?.addEventListener('click', e => e.stopPropagation());

  /* Keyboard navigation */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLangDropdown();
  });
}

/* ===================================================
   Scroll Spy
   =================================================== */
function initScrollSpy() {
  const sections = document.querySelectorAll('main section[id]');
  const navLinks = document.querySelectorAll('.nav__links a[href^="#"]');
  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => {
          link.classList.toggle(
            'active',
            link.getAttribute('href') === `#${entry.target.id}`
          );
        });
      }
    });
  }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });

  sections.forEach(s => observer.observe(s));
}

/* ===================================================
   Catalog Tabs
   =================================================== */
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      tabPanels.forEach(p => {
        p.classList.toggle('active', p.id === target);
      });
    });
  });
}

/* ===================================================
   Form Submission
   ===================================================
   TODO: Replace the fetch() stub below with your real
   backend endpoint, Formspree URL, or CRM webhook.
   Expected POST body is JSON (see formData object).
   On success, show #form-success; on error, show
   #form-error with the contact email.
   =================================================== */
function validateForm(form) {
  const rules = [
    { name: 'company',  type: 'text'   },
    { name: 'contact',  type: 'text'   },
    { name: 'email',    type: 'email'  },
    { name: 'biz_type', type: 'select' },
    { name: 'volume',   type: 'select' },
  ];

  let firstInvalid = null;
  let valid = true;

  rules.forEach(({ name, type }) => {
    const el = form[name];
    const errorEl = form.querySelector(`[data-error="${name}"]`);
    let msg = '';

    if (!el || !el.value.trim()) {
      msg = t('form_err_required');
    } else if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) {
      msg = t('form_err_email');
    }

    if (el) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (errorEl) errorEl.textContent = msg;

    if (msg) {
      valid = false;
      if (!firstInvalid) firstInvalid = el;
    }
  });

  if (firstInvalid) firstInvalid.focus();
  return valid;
}

function initForm() {
  const form = document.getElementById('quote-form');
  if (!form) return;

  /* Clear error on input */
  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => {
      el.setAttribute('aria-invalid', 'false');
      const errorEl = form.querySelector(`[data-error="${el.name}"]`);
      if (errorEl) errorEl.textContent = '';
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();

    if (!validateForm(form)) return;

    const submitBtn = form.querySelector('.btn-submit');
    const errorMsg  = document.getElementById('form-error');
    const successEl = document.getElementById('form-success');
    const formWrap  = document.getElementById('form-wrap');

    submitBtn.disabled = true;
    const btnOrigHTML = submitBtn.innerHTML;
    submitBtn.innerHTML = `<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg><span>${t('form_sending')}</span>`;
    if (errorMsg) errorMsg.style.display = 'none';

    const formData = {
      company:  form.company.value.trim(),
      contact:  form.contact.value.trim(),
      email:    form.email.value.trim(),
      phone:    form.phone.value.trim(),
      bizType:  form.biz_type.value,
      volume:   form.volume.value,
      message:  form.message.value.trim(),
      lang:     currentLang,
    };

    try {
      /* ─── STUB: replace with real endpoint ─── */
      const FORM_ENDPOINT = ''; // e.g. 'https://formspree.io/f/YOUR_ID'

      if (!FORM_ENDPOINT) {
        /* Development: simulate success after short delay */
        await new Promise(r => setTimeout(r, 800));
        showFormSuccess(formWrap, successEl);
        return;
      }

      const resp = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (resp.ok) {
        showFormSuccess(formWrap, successEl);
      } else {
        throw new Error('Server error');
      }
    } catch {
      if (errorMsg) errorMsg.style.display = 'block';
      submitBtn.innerHTML = btnOrigHTML;
      submitBtn.disabled = false;
    }
  });
}

function showFormSuccess(formWrap, successEl) {
  if (formWrap)  formWrap.style.display  = 'none';
  if (successEl) successEl.style.display = 'block';
}

/* ===================================================
   Back to Top
   =================================================== */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 500);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ===================================================
   Scroll Reveal
   =================================================== */
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => observer.observe(el));
}

/* ===================================================
   Boot
   =================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  await loadI18n();
  buildLangSwitcher();

  /* Detect saved or browser preference */
  const saved = localStorage.getItem('lb_lang');
  const browserLang = navigator.language?.slice(0, 2);
  if (saved && ALL_LANGS.includes(saved)) {
    currentLang = saved;
  } else if (browserLang && ALL_LANGS.includes(browserLang)) {
    currentLang = browserLang;
  }

  applyTranslations();
  initNav();
  initScrollSpy();
  initTabs();
  initForm();
  initScrollReveal();
  initBackToTop();
});
