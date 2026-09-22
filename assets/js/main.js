/* ==============================================================
   Page behaviour: nav, and the quote form.
   ============================================================== */

(function () {
  'use strict';

  /* ---- sticky nav, and which section you are in -------------
     is-stuck is what turns the full-bleed bar into the floating
     island; is-active fills the chip for the section under the
     reading line.

     The line sits a third of the way down the viewport rather than
     at its top edge: a section counts as "the one you are reading"
     once its heading has come up past that, which is roughly where
     people actually look. At the very top of the page nothing is
     marked at all, which is correct - you are in the hero, and none
     of the four links point at it. */
  var nav = document.getElementById('nav');
  var navLinks = [].slice.call(document.querySelectorAll('.nav__links a'));
  var sections = navLinks.map(function (a) {
    return document.querySelector(a.getAttribute('href'));
  });

  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 8);

      var line = window.scrollY + (window.innerHeight * 0.32);
      var current = -1;
      sections.forEach(function (section, i) {
        if (section && section.offsetTop <= line) current = i;
      });
      navLinks.forEach(function (a, i) {
        a.classList.toggle('is-active', i === current);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ---- mobile menu ----------------------------------------- */
  var toggle = document.querySelector('.nav__toggle');
  var mobile = document.getElementById('nav-mobile');
  if (toggle && mobile) {
    toggle.addEventListener('click', function () {
      var open = mobile.hasAttribute('data-open');
      if (open) {
        mobile.removeAttribute('data-open');
        mobile.hidden = true;
      } else {
        mobile.hidden = false;
        mobile.setAttribute('data-open', '');
      }
      toggle.setAttribute('aria-expanded', String(!open));
    });
    mobile.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        mobile.removeAttribute('data-open');
        mobile.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- footer year ----------------------------------------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---- quote form ------------------------------------------
     Works with no back end at all: if data-endpoint is empty the
     form falls back to opening a pre-filled email. Put a POST
     endpoint (Formspree, Netlify, your own) in data-endpoint on
     the <form> and it will submit as JSON instead. See README.  */

  var form = document.getElementById('quote-form');
  if (!form) return;

  var status = document.getElementById('qform-status');
  // EDIT: the address the mailto fallback sends to
  var FALLBACK_EMAIL = 'hello@forestcity.marketing';

  function say(msg, kind) {
    if (!status) return;
    status.textContent = msg;
    status.className = 'qform__status' + (kind ? ' is-' + kind : '');
  }

  function markInvalid(el, bad) {
    if (bad) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }

  function validate() {
    var problems = [];
    var required = form.querySelectorAll('input[required], textarea[required]');

    for (var i = 0; i < required.length; i++) {
      var el = required[i];
      var bad = el.type === 'checkbox' ? !el.checked : !el.value.trim();
      if (!bad && el.type === 'email') bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value);
      markInvalid(el, bad);
      if (bad) problems.push(el);
    }

    if (!form.querySelector('input[name="needs"]:checked')) {
      problems.push(form.querySelector('input[name="needs"]'));
    }
    return problems;
  }

  function collect() {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      if (key === 'company_url') return;             // honeypot
      if (data[key] === undefined) data[key] = value;
      else data[key] = data[key] + ', ' + value;     // multi-select
    });
    return data;
  }

  function mailtoFallback(data) {
    var lines = [
      'Name: '     + (data.name || ''),
      'Business: ' + (data.business || ''),
      'Email: '    + (data.email || ''),
      'Phone: '    + (data.phone || '-'),
      '',
      'Looking for: ' + (data.needs || '-'),
      'Current provider: ' + (data.incumbent || '-'),
      '',
      (data.message || '')
    ];
    window.location.href = 'mailto:' + FALLBACK_EMAIL +
      '?subject=' + encodeURIComponent('Quote request - ' + (data.business || data.name || '')) +
      '&body='    + encodeURIComponent(lines.join('\n'));
    say('Opening your email app with the details filled in. If nothing happens, email us at ' +
        FALLBACK_EMAIL + '.', 'ok');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // silently drop bots
    var hp = form.querySelector('[name="company_url"]');
    if (hp && hp.value) return;

    var problems = validate();
    if (problems.length) {
      say('Just a couple of gaps to fill in first.', 'err');
      if (problems[0] && problems[0].focus) problems[0].focus();
      return;
    }

    var data = collect();
    var endpoint = form.getAttribute('data-endpoint');
    var btn = form.querySelector('button[type="submit"]');

    if (!endpoint) { mailtoFallback(data); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    say('');

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        form.reset();
        say('Got it. We will come back to you with a quote, usually within two working days.', 'ok');
      })
      .catch(function () {
        say('That did not send, sorry. Email us at ' + FALLBACK_EMAIL + ' and we will pick it up.', 'err');
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Send it over'; }
      });
  });

  // clear the invalid state as soon as someone starts fixing it
  form.addEventListener('input', function (e) {
    if (e.target.hasAttribute('aria-invalid')) markInvalid(e.target, false);
  });
})();
