/* ==============================================================
   The rough SEO check.

   Static site, no back end. The browser cannot fetch another
   origin directly, so the page comes back through a public
   reader (see PROXIES for the bake-off and why jina leads).

   If you stand up your own - a ten-line Cloudflare Worker that
   fetches ?url= and echoes the body with an Access-Control-Allow-
   Origin header - put it in ENDPOINT and the public ones stop
   being used. Do that before this gets real traffic: they are all
   rate limited and none of them owes us an uptime.

   What this is NOT: a crawl. It reads the one page you give it,
   plus /robots.txt and /sitemap.xml. That is enough for a rough
   number, and the copy says it is rough. It cannot see rankings,
   backlinks or anything Google keeps to itself.
   ============================================================== */

(function () {
  'use strict';

  var form = document.getElementById('seo-form');
  if (!form) return;

  // EDIT: your own proxy. '' falls back to the public ones below.
  var ENDPOINT = '';

  /* Tried in order. Measured 2026-09-03, all from a cold browser:

       r.jina.ai      200 in 0.3s          <- and 1.5s on a 700KB page
       allorigins     timeout, then 429
       codetabs       timeout, then 429
       corsproxy.io   401, wants a paid key
       cors.lol       dead
       thingproxy     dead

     allorigins and codetabs both rate limited us inside an afternoon of
     testing, which is the whole argument for ENDPOINT above. They stay
     as fallbacks because of `raw`.

     `raw` means the proxy returns the file byte for byte. Jina does not:
     it renders the page in a real browser and hands back the DOM. For the
     page itself that is an improvement - it is closer to what Google
     indexes, and it sees content that only appears after JS runs. For
     robots.txt and sitemap.xml it is useless, because it renders those
     too and gives back the site's own text. So those two ask for a raw
     proxy only, and say "could not check" rather than guess. */
  var PROXIES = [
    { name: 'jina', raw: false,
      url: function (u) { return 'https://r.jina.ai/' + u; },
      headers: { 'x-return-format': 'html' } },

    { name: 'allorigins', raw: true,
      url: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },

    { name: 'codetabs', raw: true,
      url: function (u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); } }
  ];

  // Per attempt, and for the whole run. Both are needed: the chain is
  // three proxies deep and may be retried on http, so a per-attempt limit
  // alone lets the worst case run to the best part of a minute. Measured:
  // jina answers in 0.3s, and 1.5s on a 700KB page; allorigins took 5s
  // when it was answering at all. DEADLINE is what the visitor actually
  // waits, and it clears the worst legitimate case - three 9s tries for
  // the page, then one 6s try each for robots.txt and sitemap.xml, run
  // in parallel.
  var TIMEOUT  = 9000;
  var DEADLINE = 34000;
  // What a site we had built would score. Every one of the fifteen checks
  // is something the person building the site controls, so 100 is a real
  // number here, not a boast.
  var TARGET = 100;

  /* The grading curve. The raw total is the fraction of the weight a site
     earned; this bends it down before it is shown, so a site has to be
     genuinely clean to read as clean. 0 stays 0 and 100 stays 100 - it is
     the middle that tightens:

         raw   68  ->  58        raw   85  ->  80
         raw   41  ->  29        raw   96  ->  94

     Nothing underneath moves. The findings are the findings; this only
     changes how generously they are added up, and the whole index is our
     own rubric rather than anything Google publishes. Set it to 1 to grade
     flat again. */
  var CURVE = 1.4;

  // bumped on every run, so a slow reply that lands after we have
  // already given up cannot overwrite the message on screen
  var runId = 0;

  var input    = document.getElementById('seo-url');
  var btn      = document.getElementById('seo-go');
  var status   = document.getElementById('seo-status');
  var out      = document.getElementById('seo-out');
  var elNum    = document.getElementById('seo-num');
  var elMeter  = document.getElementById('seo-meter');
  var elVerd   = document.getElementById('seo-verdict');
  var elUp     = document.getElementById('seo-up');
  var elUpNote = document.getElementById('seo-upnote');
  var elFor    = document.getElementById('seo-for');
  var elList   = document.getElementById('seo-list');

  var lastRun = null;

  /* ---- the breathing ellipsis -------------------------------
     1,2,3,2 and round again, which reads as ". .. ... .. . .. ..."
     - a ping-pong, so it turns round instead of snapping back to
     one dot. (The hero bird used to run on the same idea; it now
     glances at random intervals instead. This one stays regular on
     purpose - it is a progress indicator, and a progress indicator
     that stutters looks like it has hung.)

     One interval drives every dot on the page, and it only runs
     while a check does. The dots live in their own span so the
     status line and the button keep a fixed width as they come and
     go; a button that grows and shrinks a character at a time is
     the thing that actually reads as broken.

     They are aria-hidden: #seo-status is a live region, and four
     announcements a second is not information. */

  var DOT_CYCLE = [1, 2, 3, 2];
  var DOT_BEAT  = 260;

  var dotTimer = null;
  var dotStep  = 0;
  var dotText  = '.';

  function stillFrame() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function dotSpan() {
    var s = document.createElement('span');
    s.className = 'seo__dots';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = dotText;          // seeded, so a new span is never blank
    return s;
  }

  function writeDots() {
    var all = document.querySelectorAll('.seo__dots');
    for (var i = 0; i < all.length; i++) all[i].textContent = dotText;
  }

  function paintDots() {
    dotText = new Array(DOT_CYCLE[dotStep++ % DOT_CYCLE.length] + 1).join('.');
    writeDots();
  }

  function dotsRun() {
    if (dotTimer) return;
    // reduced motion: a plain ellipsis that sits there
    if (stillFrame()) { dotText = '...'; writeDots(); return; }
    dotStep = 0;
    paintDots();
    dotTimer = setInterval(paintDots, DOT_BEAT);
  }

  function dotsHalt() {
    if (dotTimer) { clearInterval(dotTimer); dotTimer = null; }
  }

  /* ---- plumbing -------------------------------------------- */

  function say(msg, kind) {
    status.textContent = msg;
    status.className = 'seo__status' + (kind ? ' is-' + kind : '');
  }

  // a message that is waiting on something, with the ellipsis running
  function sayWaiting(msg) {
    say(msg);
    status.appendChild(dotSpan());
    dotsRun();
  }

  /* opts.timeout   per-attempt limit, overriding TIMEOUT
     opts.rawOnly   skip proxies that render rather than pass through
     opts.missingOk a 4xx from the target resolves to '' (the file is
                    genuinely not there) instead of moving down the chain */
  function fetchText(url, opts) {
    opts = opts || {};
    var limit = opts.timeout || TIMEOUT;

    var chain;
    if (ENDPOINT) {
      chain = [{ name: 'own', raw: true, url: function (u) { return ENDPOINT + encodeURIComponent(u); } }];
    } else {
      chain = [];
      for (var p = 0; p < PROXIES.length; p++) {
        if (!opts.rawOnly || PROXIES[p].raw) chain.push(PROXIES[p]);
      }
    }

    var i = 0;
    function attempt() {
      if (i >= chain.length) return Promise.reject(new Error('unreachable'));
      var via = chain[i++];
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, limit);

      var init = {};
      if (ctl) init.signal = ctl.signal;
      if (via.headers) init.headers = via.headers;

      return fetch(via.url(url), init)
        .then(function (res) {
          clearTimeout(timer);
          // "the server answered, and the file is not there" is an answer,
          // not a failure - don't burn the rest of the chain looking again
          if (opts.missingOk && res.status >= 400 && res.status < 500) return '';
          if (!res.ok) throw new Error('status ' + res.status);
          return res.text();
        })
        .then(function (text) {
          if (text === '') return text;
          if (!text || text.length < 40) throw new Error('empty');
          return text;
        })
        .catch(function (err) {
          clearTimeout(timer);
          if (i < chain.length) return attempt();
          throw err;
        });
    }
    return attempt();
  }

  /* robots.txt and sitemap.xml. Resolves to { reached, text } so the two
     outcomes stay apart: `reached` false means no proxy would answer at
     all, and the check says so instead of marking the site down for a
     file we never actually looked for. Raw proxies only (see PROXIES),
     one 6s attempt each - they are worth nine points between them and
     chasing a file that usually is not there used to blow the deadline. */
  function fetchQuiet(url) {
    return fetchText(url, { timeout: 6000, rawOnly: true, missingOk: true })
      .then(function (text) { return { reached: true, text: text }; })
      .catch(function () { return { reached: false, text: null }; });
  }

  function tidyUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    s = s.replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u;
  }

  function words(doc) {
    var body = doc.body;
    if (!body) return 0;
    var clone = body.cloneNode(true);
    var junk = clone.querySelectorAll('script,style,noscript,svg,template');
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    var t = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return t ? t.split(' ').length : 0;
  }

  // Headings are often written across several source lines. Quoting one
  // back with its newlines and indentation intact looks broken.
  function flat(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function grade(weight, factor, label, note) {
    return {
      weight: weight,
      factor: factor,
      state: factor === 1 ? 'pass' : (factor > 0 ? 'warn' : 'fail'),
      label: label,
      note: note
    };
  }

  // A check we could not run. Its weight comes out of the total on both
  // sides, so not being able to look is never scored as a fault.
  function unknown(weight, label, note) {
    return { weight: weight, factor: 0, state: 'skip', label: label, note: note };
  }

  /* ---- the checks ------------------------------------------
     Each returns a weight, a state and one plain-English line.
     The weights add to 100. Nudge them here, nowhere else.     */

  function runChecks(doc, ctx) {
    var res = [];
    var q  = function (sel) { return doc.querySelector(sel); };
    var qa = function (sel) { return doc.querySelectorAll(sel); };
    var attr = function (sel, a) { var el = q(sel); return el ? flat(el.getAttribute(a)) : ''; };

    /* title -------------------------------------------------- */
    var titleEl = q('title');
    var title = titleEl ? flat(titleEl.textContent) : '';
    if (!title) {
      res.push(grade(12, 0, 'Page title',
        'There is no title tag at all. That is the line Google prints as your headline.'));
    } else if (title.length < 15) {
      res.push(grade(12, 0.5, 'Page title',
        'Only ' + title.length + ' characters - "' + title + '". Too short to say what you do or where you are.'));
    } else if (title.length > 65) {
      res.push(grade(12, 0.5, 'Page title',
        title.length + ' characters, so Google cuts it off around 60. The end of it is wasted.'));
    } else {
      res.push(grade(12, 1, 'Page title', 'Good length - "' + title + '".'));
    }

    /* meta description --------------------------------------- */
    var desc = flat(attr('meta[name="description" i]', 'content'));
    if (!desc) {
      res.push(grade(10, 0, 'Search description',
        'Missing. Google scrapes some sentence off the page instead, and it usually picks badly.'));
    } else if (desc.length < 70) {
      res.push(grade(10, 0.5, 'Search description',
        'Present but only ' + desc.length + ' characters. There is room for about 155 - that is free advertising going unused.'));
    } else if (desc.length > 170) {
      res.push(grade(10, 0.5, 'Search description',
        desc.length + ' characters, so the last third is truncated in the results.'));
    } else {
      res.push(grade(10, 1, 'Search description', 'Present and a sensible length.'));
    }

    /* h1 ------------------------------------------------------ */
    var h1s = qa('h1');
    if (h1s.length === 0) {
      res.push(grade(9, 0, 'Main heading',
        'No H1 on the page. That is the heading Google leans on hardest to work out what this page is for.'));
    } else if (h1s.length > 1) {
      res.push(grade(9, 0.5, 'Main heading',
        h1s.length + ' H1 headings. There should be one, so the page has one clear subject.'));
    } else if (!flat(h1s[0].textContent)) {
      res.push(grade(9, 0, 'Main heading', 'The H1 is empty - usually a logo image with no text inside it.'));
    } else {
      res.push(grade(9, 1, 'Main heading', 'One clear H1: "' + flat(h1s[0].textContent).slice(0, 70) + '".'));
    }

    /* subheadings --------------------------------------------- */
    var h2s = qa('h2').length;
    if (h2s === 0) {
      res.push(grade(4, 0, 'Subheadings',
        'No H2s. To a search engine the page is one undifferentiated block.'));
    } else if (h2s < 3) {
      res.push(grade(4, 0.5, 'Subheadings', 'Only ' + h2s + '. A bit more structure would help.'));
    } else {
      res.push(grade(4, 1, 'Subheadings', h2s + ' subheadings giving the page a shape.'));
    }

    /* image alt text ------------------------------------------ */
    var imgs = qa('img');
    if (imgs.length === 0) {
      res.push(grade(8, 0.5, 'Image alt text',
        'No images found on the page. For a local business that is usually a missed opportunity in itself.'));
    } else {
      var withAlt = 0;
      for (var i = 0; i < imgs.length; i++) if (imgs[i].hasAttribute('alt')) withAlt++;
      var pct = Math.round(withAlt / imgs.length * 100);
      if (pct >= 90) {
        res.push(grade(8, 1, 'Image alt text', pct + '% of ' + imgs.length + ' images are described. Good.'));
      } else if (pct >= 50) {
        res.push(grade(8, 0.5, 'Image alt text',
          'Only ' + pct + '% of ' + imgs.length + ' images have alt text. Google reads that text; so do screen readers.'));
      } else {
        res.push(grade(8, 0, 'Image alt text',
          'Just ' + pct + '% of ' + imgs.length + ' images have alt text. Every one of the rest is invisible to Google.'));
      }
    }

    /* viewport ------------------------------------------------- */
    if (attr('meta[name="viewport" i]', 'content')) {
      res.push(grade(8, 1, 'Built for phones', 'A viewport tag is set, so the layout responds to phone screens.'));
    } else {
      res.push(grade(8, 0, 'Built for phones',
        'No viewport tag. The site renders desktop-width on a phone, and Google ranks on the phone version.'));
    }

    /* https ---------------------------------------------------- */
    if (ctx.scheme === 'https:') {
      res.push(grade(8, 1, 'Secure (HTTPS)', 'Served over HTTPS with a working certificate.'));
    } else {
      res.push(grade(8, 0, 'Secure (HTTPS)',
        'HTTPS failed - the site answered on plain HTTP. Browsers put a "Not secure" warning next to the address.'));
    }

    /* canonical ------------------------------------------------ */
    if (attr('link[rel="canonical" i]', 'href')) {
      res.push(grade(5, 1, 'Canonical URL', 'Set, so Google knows which address is the real one.'));
    } else {
      res.push(grade(5, 0, 'Canonical URL',
        'Missing. If the same page answers at more than one address, Google splits the credit between them.'));
    }

    /* open graph ----------------------------------------------- */
    var og = 0;
    if (attr('meta[property="og:title" i]', 'content')) og++;
    if (attr('meta[property="og:description" i]', 'content')) og++;
    if (attr('meta[property="og:image" i]', 'content')) og++;
    if (og === 3) {
      res.push(grade(5, 1, 'Link previews', 'Full Open Graph tags - shares on Facebook and WhatsApp will look right.'));
    } else if (og > 0) {
      res.push(grade(5, 0.5, 'Link previews', og + ' of 3 Open Graph tags. Shared links look half-finished.'));
    } else {
      res.push(grade(5, 0, 'Link previews', 'None. Paste your address into WhatsApp and you get a bare grey box.'));
    }

    /* structured data ------------------------------------------ */
    var ld = qa('script[type="application/ld+json"]');
    if (ld.length) {
      var blob = '';
      for (var j = 0; j < ld.length; j++) blob += ld[j].textContent || '';
      if (/LocalBusiness|Organization|Restaurant|Store|ProfessionalService|Dentist|Plumber/i.test(blob)) {
        res.push(grade(8, 1, 'Business markup',
          'Structured data describing the business is present. That is what feeds the map pack and the rich results.'));
      } else {
        res.push(grade(8, 0.5, 'Business markup',
          'Some structured data, but nothing in it identifies you as a local business.'));
      }
    } else {
      res.push(grade(8, 0, 'Business markup',
        'No structured data. Google has to guess your address, hours and phone number from the page text.'));
    }

    /* content depth -------------------------------------------- */
    var w = ctx.words;
    if (w >= 500) {
      res.push(grade(8, 1, 'Enough to read', 'Around ' + w + ' words on the page.'));
    } else if (w >= 250) {
      res.push(grade(8, 0.5, 'Enough to read',
        'Around ' + w + ' words. Thin - there is not much here for Google to match a search against.'));
    } else {
      res.push(grade(8, 0, 'Enough to read', 'Only about ' + w + ' words. Nearly nothing to rank.'));
    }

    /* internal links ------------------------------------------- */
    var anchors = qa('a[href]');
    var internal = {};
    for (var k = 0; k < anchors.length; k++) {
      var href = anchors[k].getAttribute('href') || '';
      if (/^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
      try {
        var abs = new URL(href, ctx.href);
        if (abs.hostname === ctx.host) internal[abs.pathname] = 1;
      } catch (e) { /* skip anything unparseable */ }
    }
    var n = Object.keys(internal).length;
    if (n >= 5) {
      res.push(grade(4, 1, 'Internal links', n + ' pages linked from here.'));
    } else if (n >= 2) {
      res.push(grade(4, 0.5, 'Internal links', 'Only ' + n + ' internal links. Google crawls by following them.'));
    } else {
      res.push(grade(4, 0, 'Internal links', 'Effectively a dead end - nothing for a crawler to follow onward.'));
    }

    /* language ------------------------------------------------- */
    if ((doc.documentElement.getAttribute('lang') || '').trim()) {
      res.push(grade(2, 1, 'Language declared', 'The lang attribute is set.'));
    } else {
      res.push(grade(2, 0, 'Language declared', 'No lang attribute on the html tag. A small thing, but it is free to fix.'));
    }

    /* sitemap -------------------------------------------------- */
    if (!ctx.auxReached) {
      res.push(unknown(6, 'Sitemap', 'We could not check this one - nothing would serve us the file. It is worth looking at by hand.'));
    } else if (ctx.sitemap) {
      res.push(grade(6, 1, 'Sitemap',
        'A sitemap.xml is published, so Google gets a list of your pages rather than hunting for them.'));
    } else if (ctx.sitemapInRobots) {
      res.push(grade(6, 0.5, 'Sitemap', 'robots.txt points at a sitemap, but it did not load from the usual address.'));
    } else {
      res.push(grade(6, 0, 'Sitemap', 'No sitemap.xml. Pages that are not linked from the homepage may never be found.'));
    }

    /* robots.txt ----------------------------------------------- */
    if (!ctx.auxReached) {
      res.push(unknown(3, 'robots.txt', 'We could not check this one - nothing would serve us the file.'));
    } else if (ctx.robots === null) {
      res.push(grade(3, 0.5, 'robots.txt', 'No robots.txt. Not fatal, but you have no say in what gets crawled.'));
    } else if (/Disallow:\s*\/\s*$/im.test(ctx.robots)) {
      res.push(grade(3, 0, 'robots.txt', 'Your robots.txt blocks the whole site from being crawled. This one is urgent.'));
    } else {
      res.push(grade(3, 1, 'robots.txt', 'Present, and not blocking the site.'));
    }

    /* There was a page-weight check here, scored off the size of the HTML.
       It came out when jina became the first proxy: jina returns the
       RENDERED DOM, so the same site measures ~20x heavier through it than
       through a raw proxy, and the check would have failed every site
       built on Squarespace or Wix for a reason that was ours, not theirs.
       Its 3 points went to HTTPS, business markup and content depth. */

    return res;
  }

  /* ---- rendering -------------------------------------------- */

  function verdict(score) {
    if (score >= 85) return 'in good shape.';
    if (score >= 70) return 'solid, with gaps.';
    if (score >= 50) return 'leaving a lot on the table.';
    if (score >= 30) return 'google is struggling with this.';
    return 'effectively invisible.';
  }

  function render(score, checks, ctx) {
    // The headroom, stated as what it is: a lift on THIS score, not a
    // traffic promise. The floor of 8 on the divisor stops a site that
    // scores 3 from being told we can improve it by 3000%.
    var uplift = Math.min(150, Math.round((TARGET - score) / Math.max(score, 8) * 100));
    if (uplift < 0) uplift = 0;

    elFor.textContent = ctx.host;
    elNum.textContent = String(score);
    elVerd.textContent = verdict(score);
    elUp.textContent = String(uplift);

    elUpNote.textContent = uplift === 0
      ? 'Genuinely little for us to do here. We would rather tell you that than sell you a rebuild.'
      : 'That is a lift on the score, not a promise about your traffic - we would take it from ' +
        score + ' to ' + TARGET + ' out of 100. What that does to enquiries depends on your trade ' +
        'and your town, and anyone who quotes you a number for that is guessing.';

    // twenty cells, one per five points
    var filled = Math.round(score / 5);
    elMeter.innerHTML = '';
    for (var i = 0; i < 20; i++) {
      var cell = document.createElement('i');
      if (i < filled) cell.className = 'is-on';
      elMeter.appendChild(cell);
    }
    elMeter.setAttribute('aria-label', score + ' out of 100');

    // worst first: the list should open on the things worth paying to fix
    var order = { fail: 0, warn: 1, pass: 2, skip: 3 };
    checks.sort(function (a, b) {
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return b.weight - a.weight;
    });

    // problems only. What passed is already carried by the count below,
    // and a wall of green is not what anyone came here to read.
    var problems = [];
    for (var j = 0; j < checks.length; j++) {
      if (checks[j].state !== 'pass') problems.push(checks[j]);
    }

    /* Three, and then a gate.
       The sort above is worst-first, so the three on show are the three
       worth the most - somebody who reads no further still leaves with
       the findings that matter. The rest are real and the count is the
       true one; "and 4 more" that turns out to be 4 is worth something,
       "and 4 more" that turns out to be 0 is the reason nobody trusts
       these tools.

       Three is also what keeps the grid honest: the list is two columns,
       so 3 + the gate is a clean 2x2 and 2 + the gate lets the existing
       last-child:nth-child(odd) rule span the gate across. Change SHOWN
       and you get a stray empty tile back. */
    var SHOWN = 3;

    elList.innerHTML = '';
    var upTo = Math.min(SHOWN, problems.length);
    for (var k = 0; k < upTo; k++) {
      var c = problems[k];
      var li = document.createElement('li');
      li.className = 'seo__row';
      li.setAttribute('data-state', c.state);
      var h = document.createElement('h4');
      h.textContent = c.label;
      var p = document.createElement('p');
      p.textContent = c.note;
      li.appendChild(h);
      li.appendChild(p);
      elList.appendChild(li);
    }

    var held = problems.length - upTo;
    if (held > 0) {
      var lock = document.createElement('li');
      lock.className = 'seo__row seo__row--held';
      var a = document.createElement('a');
      a.href = '#quote';
      var lh = document.createElement('h4');
      lh.textContent = 'and ' + held + ' more issue' + (held === 1 ? '' : 's') + '…';
      var lp = document.createElement('p');
      lp.textContent = 'Ask for a quote and we’ll write the rest of them out for you, ' +
        'with what each one is costing you. No charge, no obligation.';
      a.appendChild(lh);
      a.appendChild(lp);
      lock.appendChild(a);
      elList.appendChild(lock);
    }

    elList.hidden = !elList.children.length;

    // Not shown any more - the list speaks for itself - but still counted,
    // because it goes into the quote form with the handoff below.
    var broken = 0;
    for (var m = 0; m < checks.length; m++) {
      if (checks[m].state !== 'pass' && checks[m].state !== 'skip') broken++;
    }

    lastRun = { host: ctx.host, href: ctx.href, score: score, broken: broken };

    out.hidden = false;
  }

  /* ---- the run ---------------------------------------------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var u = tidyUrl(input.value);
    if (!u) {
      say('That does not look like a web address. Try something like georgesbarbers.co.uk', 'err');
      input.focus();
      return;
    }

    input.value = u.hostname + (u.pathname === '/' ? '' : u.pathname);
    out.hidden = true;

    /* Freeze the button at the width it already has before the label
       changes, and hand it ONE child. .btn is an inline-flex with an 8px
       gap, so a bare text node plus a separate dots span made two flex
       items with that gap opened up between them - which is what was
       still moving. One span, one flex item, and a width that cannot
       change whatever the label says. */
    btn.style.width = btn.getBoundingClientRect().width + 'px';
    btn.disabled = true;
    btn.textContent = '';
    var label = document.createElement('span');
    label.textContent = 'checking';
    label.appendChild(dotSpan());
    btn.appendChild(label);

    sayWaiting('Fetching ' + u.hostname + ' - this takes a few seconds');

    var origin = u.origin;
    var scheme = u.protocol;
    var mine = ++runId;
    var mineStill = function () { return mine === runId; };

    function done(msg, kind) {
      if (!mineStill()) return false;
      runId++;                       // orphan anything still in flight
      dotsHalt();
      say(msg, kind);
      btn.disabled = false;
      btn.textContent = 'run the check';
      btn.style.width = '';          // back to sizing itself
      return true;
    }

    // A big homepage through a public proxy is genuinely slow, so say so
    // rather than leaving a button that looks stuck.
    var nudge = setTimeout(function () {
      if (mineStill()) sayWaiting('Still going. Bigger sites take longer to read');
    }, 9000);

    var giveUp = setTimeout(function () {
      done('That took too long. ' + u.hostname + ' is slow to answer, or it blocks automated ' +
           'readers. Send it to hello@forestcity.marketing and we will look at it by hand.', 'err');
    }, DEADLINE);

    fetchText(u.href)
      .catch(function () {
        // https failed outright: fall back to http, and remember that it did
        if (u.protocol !== 'https:') throw new Error('unreachable');
        return fetchText(u.href.replace(/^https:/, 'http:')).then(function (html) {
          scheme = 'http:';
          origin = origin.replace(/^https:/, 'http:');
          return html;
        });
      })
      .then(function (html) {
        if (!mineStill()) throw new Error('abandoned');
        sayWaiting('Reading robots.txt and sitemap.xml');
        return Promise.all([
          html,
          fetchQuiet(origin + '/robots.txt'),
          fetchQuiet(origin + '/sitemap.xml')
        ]);
      })
      .then(function (parts) {
        if (!mineStill()) return;
        var html    = parts[0];
        var robots  = parts[1];
        var sitemap = parts[2];

        // A proxy that 404s often hands back its own HTML error page, and
        // some hosts serve the site itself for any unknown path. Neither is
        // a robots.txt, so require it to actually contain a directive.
        var robotsText = robots.text;
        if (robotsText && !/^\s*(user-agent|disallow|allow|sitemap)\s*:/im.test(robotsText)) {
          robotsText = null;
        }
        if (robotsText === '') robotsText = null;

        var hasSitemap = !!(sitemap.text && /<(urlset|sitemapindex)/i.test(sitemap.text));

        var doc = new DOMParser().parseFromString(html, 'text/html');

        var ctx = {
          host: u.hostname,
          href: origin + u.pathname,
          scheme: scheme,
          words: words(doc),
          auxReached: robots.reached || sitemap.reached,
          robots: robotsText,
          sitemap: hasSitemap,
          sitemapInRobots: !!(robotsText && /sitemap:/i.test(robotsText))
        };

        var checks = runChecks(doc, ctx);
        // A skipped check leaves the total on both sides, so a file we
        // could not fetch never reads as a fault on their site.
        var earned = 0, possible = 0;
        for (var i = 0; i < checks.length; i++) {
          if (checks[i].state === 'skip') continue;
          earned   += checks[i].weight * checks[i].factor;
          possible += checks[i].weight;
        }
        var raw = possible ? earned / possible : 0;
        var score = Math.max(1, Math.round(Math.pow(raw, CURVE) * 100));

        if (!done('')) return;
        render(score, checks, ctx);
        out.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function () {
        done('We could not read ' + u.hostname + '. Either it is down, the address is wrong, or it blocks ' +
             'automated readers. Send it to hello@forestcity.marketing and we will look at it by hand.', 'err');
      })
      .then(function () {
        clearTimeout(nudge);
        clearTimeout(giveUp);
      });
  });

  /* ---- hand the result to the quote form -------------------- */

  var handoff = document.getElementById('seo-handoff');
  if (handoff) {
    handoff.addEventListener('click', function () {
      if (!lastRun) return;
      var msg = document.querySelector('#quote-form [name="message"]');
      if (msg) {
        var line = 'Our site is ' + lastRun.href + '. Your checker scored it ' +
                   lastRun.score + '/100, with ' + lastRun.broken + ' things flagged.';
        msg.value = msg.value.trim() ? msg.value.trim() + '\n\n' + line : line;
      }
      var rebuild = document.querySelector('#quote-form [name="needs"][value="Rebuild / redesign"]');
      if (rebuild) rebuild.checked = true;
    });
  }
})();
