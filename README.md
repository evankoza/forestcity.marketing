# Forest City Marketing — marketing site

Static site. No build step, no dependencies, no framework.

```
index.html
privacy.html           <- the privacy policy
404.html               <- what GitHub Pages serves for a bad path
robots.txt
sitemap.xml
assets/css/styles.css
assets/js/bird.js      <- the hero bird
assets/js/main.js      <- nav + quote form
assets/js/seo.js       <- the free SEO checker
assets/img/            <- artwork; see assets/img/README.md
assets/fonts/          <- Departure Mono + its OFL
```

`404.html` is the one file whose links are root-absolute (`/index.html`, not
`index.html`). GitHub Pages serves it for a bad path at *any* depth, so a
relative href in it would resolve against a directory that does not exist.

**Serve the folder — do not open `index.html` off disk:**

```bash
python -m http.server 4321
```

There is a `.claude/launch.json` that does the same thing if you are driving
this from Claude Code.

Over `file://` the browser treats every local file as its own origin, so
`bird.js` cannot read the sprite pixels back out of a canvas and the jay does
not appear. It fails quietly and leaves the photograph — but you will be
looking at a hero with no bird in it and wondering why. Everything else on
the page works either way.

It descends from the **We Run Web** site and keeps that site's layout, its
quote form and its SEO checker. What changed is the theme, the hero, and the
fact that this company sells more than websites.

---

## Before this goes live

### The one that matters: the company name

The business name **London Marketing Solutions Ltd.** is reserved and the
incorporation is filed but *not yet granted* — no certificate, no OCN. Until
that lands, nothing on this site may call itself "Ltd.", because naming a
corporation that does not exist yet is the only thing in this list that could
actually bite.

Two places are written and commented for the swap, and no others:

- `index.html`, the footer copyright — search `SWAP ON INCORPORATION`
- `privacy.html`, the "who is asking" clause — same marker

Each comment contains the exact replacement line. Do both at once, add the
HST number to the footer when you register for one, and bump the date at the
top of `privacy.html`.

### Still your call

| What | Where | Notes |
|---|---|---|
| "within two working days" | `#quote`, FAQ | Only promise what you'll hit |
| `$ quoted`, `$ remaining`, `$ the difference` | `#buyout` | Deliberately symbolic — real figures were tried there and looked like a quote rather than a worked example. Leave them unless you want the card to name numbers. |
| The SEO checker's proxy | `seo.js`, `ENDPOINT` | Still the public reader. Stand your own up before you put ad spend behind the tool. |
| The quote form's back end | `index.html`, `data-endpoint` | Empty, so the form opens a pre-filled email instead of POSTing. **If you fill this in, the "what you hand us on purpose" clause in `privacy.html` becomes false** — it says nothing is transmitted. There is a comment there saying so. |

Contact details are **already set** and are carried over from We Run Web —
check they are still right:

- `hello@forestcity.marketing` — `index.html` ×3, `privacy.html` ×5,
  `404.html`, `main.js`, `seo.js` ×2.
  **Create that forwarder at the registrar or mail to it bounces.**
- `226 378 5926` / `tel:+12263785926` — `index.html` ×2, `privacy.html` ×2,
  `404.html`

### Two domains, and which one is real

**`londonmarketingsolutions.ca` is the canonical address.** Every absolute URL
in the site points at it — `<link rel=canonical>`, `og:url`, `og:image`, the
JSON-LD `@id` and `url`, `sitemap.xml`, and the `Sitemap:` line in
`robots.txt`. `CNAME` holds it and it is the domain the TLS certificate is
issued for.

**`forestcity.marketing` is a redirect**, done at Namecheap with a URL Redirect
Record (permanent / 301), not through Pages. GitHub Pages serves exactly one
custom domain, so the second one can only ever be a registrar-level bounce.

The brand is still Forest City Marketing and the **email has not moved** —
`hello@forestcity.marketing` is still the address on the page, in the mailto
fallback and in the SEO checker's error copy. The forwarder for it lives at
that domain's registrar. If mail ever moves to the `.ca`, it is a separate
change in five files; search for `@forestcity.marketing` and you will find all
of them.

If you ever flip the canonical domain back, the rule is: replace
`https://<domain>` everywhere, leave `@<domain>` alone.

### Also outstanding

- **No testimonials / client work section.** The source site had one and it
  was parked because the cards were placeholders; it is not in this page at
  all. When there are real clients, that is the section to add — get their
  words and their written OK to use their name first.
- A favicon beyond the inline SVG, and analytics if you want it. Note that
  `privacy.html` currently says there is no analytics, in those words.
- A page per service, if you ever want to rank for "lawn signs London
  Ontario" rather than just your own name.
- **A mailing address**, before you ever send bulk marketing email. CASL
  wants one in a commercial electronic message; `privacy.html` gives an email
  and a phone number, which is enough for a site that only answers enquiries.
- `londonmarketingsolutions.ca` is registered and has no DNS records at all.
  Decide whether it redirects here or sits idle; an unresolving domain on a
  business card is worse than no second domain.

### Done since first deploy

- **Privacy policy** — `privacy.html`, linked from the footer, the contact
  column and the consent checkbox. PIPEDA/CASL, written to what the site
  actually does rather than from a template: no cookies, no analytics, the
  GitHub Pages logs, the Google Fonts request, the SEO checker's third-party
  reader, and the fact that the quote form sends nothing by itself.
- **`assets/fonts/OFL.txt`** — the licence Departure Mono ships with,
  verbatim from the font's own distribution.
- **`og:image`** — `assets/img/og.jpg`, built by `assets/img/src/make-og.sh`.
- **`robots.txt` and `sitemap.xml`** — the checker on this very page reads
  both on other people's sites; it was a bad look not to have them.
- **`404.html`**.
- **A canonical URL and `ProfessionalService` JSON-LD** on `index.html`. The
  checker on this page scores other people 8 points for business markup and 5
  for a canonical; the site was failing both of its own tests. The markup
  carries a locality and a province but no street, which is what a
  service-area business is supposed to do.

---

## The hero

The one genuinely new thing here, and the one place worth reading before
editing. Three layers:

```
.hero__photo   the branch, a real photograph, full bleed
.hero__veil    the grade that lets white text survive on top of it
#bird          the dithered jay, perched
```

**The branch is a photograph and stays one.** The site this came from
dithered its whole hero, and that only worked because its source was a pale
sky. A forest canopy dithers to mud. The dither is spent on the bird instead.

### The bird is perched, not positioned

`PERCH_X` / `PERCH_Y` in `bird.js` is a point in the **photograph's own
coordinates** — the top of the left-hand limb. Every rebuild, the code works
out where `object-fit: cover` has put that point at this viewport and stands
the bird's feet on it. It reads `object-position` back out of the stylesheet
rather than keeping its own copy, so the two cannot drift apart.

The bird's size is a share of the photo's **displayed** width, not of the
viewport. Cover magnifies branch and bird by the same factor, so the bird
holds its proportion against the limb at every window size. Tie it to the
viewport and it grows off its own feet on a narrow window.

### The bird is three sprites

`jay legs.png` is the legs alone and never moves; `jay leggless left/right.png`
are the body with the head turned each way, and they bob. All three share one
305x313 canvas, so `bird.js` derives a single origin — from the legs, the only
layer with a foot in it — and lays all three on it.

**That split is what lets the bird move.** As one sprite, any movement dragged
the feet with it, so the drift had to shrink to downward-only; a two-way
version before that had the bird visibly jiggling free of the branch. With the
legs pinned the body is free in both axes and the feet cannot move at all —
`blit()` draws the legs at a literal `0, 0` and only the body takes the offset.
`BOB_X`/`BOB_Y` are a cell each, sin against cos, so it traces a slow circle
rather than sliding along a diagonal. Legs draw first and the body over them,
so the belly hides the hip join as it rides.

### The bird's right leg is hand-lengthened

Both supplied photographs catch the jay **mid-step, with its right foot
lifted** about 100px clear of the other — no placement can stand that foot
on a branch. The leg was extended by hand in the two sprites so both feet
land within about 20px of each other, and the bird can simply stand.

None of that is in the source photos — the lengthened leg and the split into
three layers are both hand work. `prep-bird.py` only rebuilds the old combined
`jay-left/right.png`, which **the page no longer loads**, and it refuses to
overwrite a file newer than its source without `--force`.

`PERCH` is where the lower toe goes. Two things about the surface caught
this out before it settled:

- The bark mask (foliage is green-dominant, bark is not) also catches the
  big **out-of-focus trunk** behind the branch. Standing on blurred trunk
  reads as floating, because the eye takes the sharp branch as the surface.
  The mask is now intersected with a local-variance test so only in-focus
  bark counts.
- A **smoothed edge curve lies near discontinuities.** One perch was placed
  off a 21px-smoothed trace that blended across the gap between trunk and
  limb, putting the toe 7px above real bark. The mask is read per column now.

### Four inks, and a dither held back

The jay is dithered against **a white, two blues and a black** — `PAL` in
`bird.js` — at a **5px cell**. Two inks at 4px read as speckle rather than
as a bird; four inks at 3px went the other way and came out almost
photographic. 5px with four inks is the chunky end that still carries the
crest, the bridle and the wing.

Two knobs matter:

- `GAMMA` is back to **1.0**. It was 1.4 when there were two inks, doing work
  the palette could not — forcing enough weight into the dark ink to stop the
  crest and the bridle dissolving into the chest. Four inks do that on their
  own, so the curve is no longer compensating for anything.
- `DIFFUSION` is **0.75**, not textbook 1.0. Full error diffusion spends
  every scrap of error on speckle, and with four closely-spaced inks that
  speckle became the loudest thing in the sprite. Holding it back lets flat
  areas — the chest, the cheek — stay flat and leaves the dithering to the
  transitions, where it is actually describing something. Much lower and it
  bands.

All four inks are lighter than the canopy except `BLACK`, which is only safe
to include because there is enough light ink around it to carry the
silhouette. See `assets/img/README.md`.

### The phone layout is a different composition, for a real reason

Under 900px the hero stops being left-art/right-copy and becomes a band of
artwork with the copy underneath.

That is forced, not preferred. On a tall narrow viewport cover scales the
photo by **height**, so the photo is exactly as tall as its box, there is no
vertical overflow left, and `object-position` cannot shift anything. The
perch therefore lands at 43.2% of the hero's height no matter what you do —
which, on a full-bleed phone hero, is straight through the middle of the body
copy. Giving the artwork its own ~46vh box fixes it at the source: 43% of the
band is near the top of the screen, and the copy starts below the band. The
bird shrinks to match on its own, because its size is a share of the photo.

### The veil weight is measured

`.hero__veil` grades the photo so the copy can sit on it. `.74` at the heavy
end is not a round number: the worst case on the page is the smallest hero
text over a blown sky gap in the canopy, the photo's brightest pixel being
effectively white, and `.74` puts every piece of hero text at 4.97:1 or
better through the composite.

It was `.90` for a while. That passed contrast comfortably and also **erased
the photograph** — the hero was a green rectangle and the branch had gone. So
`.74` is the lightest grade the text tolerates, not the safest one going. If
you add paler text to the hero, re-check it rather than assuming headroom.

---

## Bundling lives inside "what we do"

It used to be `#bundle`, its own full section between the services and the
switch. It is a **pricing note on the services**, not a second pitch, so it
now sits under the cards inside `#services` as `.tiers`: three steps, the
more services you take the bigger the discount.

Folding it in removed a section from the page (the kickers renumbered 01-06),
two nav links and a footer link, and the `.bundle` / `.stack` rules with it.
`--bark` went too — it existed only for that section's maths panel.

**It quotes no numbers, on purpose.** There was a ladder of three
percentage cards here — 2 / 3 / 4+ services — and they came out. A discount
printed on the page has to be honoured exactly as printed whatever the job
turns out to involve, and it invites people to price themselves instead of
talking to you, which is what the quote form is for.

What is left is the reasoning, and that part matters: the work genuinely
gets cheaper once we already hold the logo, fonts, colours, photos and
Google account, so it is a saving passed on rather than a penalty for
buying one thing. Don't reword it into the latter, and don't put numbers
back without deciding you will honour them.

## The services rail

The marquee between the hero and `#services`. It is a divider first and a
message second.

The two sections are both photographs, and they used to meet in **270px of
near-black** — the hero fading out over 120px, the canopy fading in over
150px, with the section's own padding on top of that. That dead band was
the transition, and it read as mud.

**The two sides of the rail are deliberately not symmetrical.** The hero
above it cuts dead into it — its `::after` fade is gone entirely, because
against a bordered rail a gradient just reads as a smudge on the bottom of
the photograph. The canopy below it fades in over 48px, because cutting
that side too made the section start with a jolt.

So the rail has a hard top edge and a soft bottom one: the photograph above
stops, and the canopy below arrives. Fading both was the original mistake —
that is what produced the 270px of black.

### It is sized into the first screen

`--rail-h` is a token because the hero subtracts it: the hero is
`100svh - var(--nav-h) - 1px - var(--rail-h)`, so the rail lands on the
fold instead of one scroll down. Change either value and the other follows.

That stray `1px` is the nav's bottom border, which sits **outside**
`--nav-h` — that token sizes `.nav__inner`, and the border is on `.nav`
around it. Without it the rail ends exactly one pixel below the fold,
which is the most annoying possible amount.

**This only holds on the two-column layout.** Under 900px the hero stacks
an artwork band above the copy and is content-driven, roughly 1076px on a
375x812 phone — there is no way to fit a photo band, a headline, two
paragraphs, two buttons and a credentials line into 687px without gutting
them, so on a phone the rail is just below the fold.

Two identical rows sit side by side and the track translates by exactly
half its width, so the moment row one has left, row two is precisely where
it started. Duplicating the row is what buys a loop with no jump. It pauses
on hover, stops entirely under `prefers-reduced-motion`, and is
`aria-hidden` — it is a looping, duplicated list of the services spelled
out properly in the section immediately below, and announcing it would be
reading the same thing twice.

> **It is not a "trusted by" logo wall, and it must not become one yet.**
> That needs clients, and there are none — logos here would be claiming
> work that has not happened, which is the same reason the source site's
> testimonials were parked rather than filled in. The services are true on
> day one. When there are real clients, this is the strip to swap them
> into, and nothing structural has to change.

## The canopy band

`#services` sits on a photograph of the canopy under a green filter — the
same structure as the hero: photo, graded veil, content above both.

Two numbers in `.section--canopy` were measured rather than chosen.

**The two veil alphas are solved together.** What you see of the photo is
`(1 - dark) x (1 - green)`, so the green tint is not free — at .42 it threw
away nearly half of what the darkening left, only 16% of the canopy
survived, and the band read as a vague glow. It is `.62` dark over `.18`
green now, which lets **31%** through.

Getting there needed the text to move too. The canopy's brightest pixel is
literally (255,255,255) — sky between leaves — and on the page's body
colours the kicker bound at 4.57:1 and capped the photo at 21%. The band's
head now uses the hero's on-photo text set instead, which is the same
principle the hero follows: type over photography needs more headroom than
type on a flat surface. That puts title, lead and kicker at 6.8, 5.8 and
4.7:1.

**It backs the whole section, but the photo is never bigger than one
viewport.** Stretching it over the section with `object-fit:cover` was the
obvious thing and it does not work — the section is ~1400px tall on a
desktop and nearly 4000px on a phone once the cards stack, so cover would
upscale by 1.4x at best and nearly 4x at worst. Instead the artwork layer
spans the section and is clipped to it, and the photo inside is
`position:sticky` at one viewport tall: the canopy holds still and the
section scrolls past it.

`overflow:clip`, with `hidden` as the fallback. Both clip; `hidden` also
makes it a scroll container, which silently kills the sticky inside, so
browsers without `clip` degrade to the artwork pinned at the top of the
section rather than a photo escaping down the page. The edge fades sit on
the section-spanning layer, not the sticky one — on the sticky one they
would ride with it and fade the middle of the section instead of its ends.

The photo is `src/canopy-original.png` at 1537x1023, served at its own size
and at 1000px.

## Type: three voices, on purpose

| role | face | where |
|---|---|---|
| the hook | **Bricolage Grotesque 800** | hero h1, every section title, card and FAQ headings |
| reading | **Inter** | body copy, buttons that are not pixel buttons, form labels |
| the pixel voice | **Departure Mono** | wordmark, pixel buttons, the SEO score panel |

The display face **used to be Departure Mono**, which put the whole page in
one pixel voice and made it read as a novelty. It is now one of three, and
the smallest share of the three: a motif, not the identity.

Swapping it is one line — `--font-display` in `styles.css` plus the Google
Fonts link in `index.html`. Anything carrying weight up to 800 drops
straight in; **Archivo** and **Figtree** are the cleaner, more neutral
alternatives, and **Anton** is heavier still but ships one weight and only
really works in caps.

**Departure Mono ships a single weight.** Ask it for 600 and the browser
synthesises it, which smears a pixel face — there is a block at the end of
`styles.css` forcing 400 on it. Do not add a heading back into that block:
it would come out in small caps. Bricolage Grotesque is variable (200-800)
and is deliberately *not* in it, because the top of that range is the
reason it was chosen.

**The hook's size is measured.** A heavy grotesque is much wider than the
serif it replaced: "Your brand's image," needs 626px at 76px against a
620px column — six pixels over, which cost a whole extra line. It is 72px
into a 640px column now, with about 47px of slack. Rewrite the headline and
re-measure rather than assuming it still fits.

## Design tokens

All colour and type lives in `:root` at the top of `styles.css`. Rebrand =
edit that block.

**The theme is dark**, and green-black rather than neutral black — every
surface carries a few points of green. A true `#000` page underneath a
forest photograph reads as a hole punched in the picture; the cast is what
makes the hero look like it belongs to the page below it.

```
--bg    #080B09   the page          --ink    #F3F6F2   headings
--bg-2  #0E120F   tinted sections   --ink-2  #BFCAC1   body
--bg-3  #141915   cards, fields     --ink-3  #8E9A90   muted
--panel #11291F   the one green band (#buyout)
```

Inverting the theme meant **the brand green had to move**. `#1B4332` carried
the old white page at 11:1 and is nearly invisible on black; `--forest` is
now `#5CBF8D`, the same hue lifted until it reads *on* dark at 8.8:1. It is
an accent — links, kickers, tick marks, the pixel buttons' hard shadow — not
a surface. The one place a whole band is green is `#buyout`, and that uses
`--panel`, which is much darker than the accent.

Two borders, and the difference matters: `--line` is decorative (card edges,
rules) and `--line-2` is for form controls, which need 3:1 to be perceivable.

The **only blue on the page** is the jay — its four inks in the hero and the
two blocks of the brand mark. That is deliberate: it is what makes the bird
lift off a green hero instead of sinking into it. Don't spend it on buttons.

Every text colour has its measured contrast in a comment beside it. A DOM
sweep of every text node against its own computed background returns zero
failures at AA, hero included.

## The quote form

Works with no back end. If the form's `data-endpoint` is empty, submitting
opens the user's email client with everything pre-filled, addressed to
`FALLBACK_EMAIL` in `main.js`.

That's fine to launch with, but a real endpoint converts better — a mailto
drops anyone using webmail on a phone. To switch:

```html
<form ... data-endpoint="https://formspree.io/f/xxxxxxx">
```

It POSTs JSON, so Formspree, Netlify Forms, Basin or your own handler all
work. On failure it falls back to showing your email address rather than
losing the enquiry.

Built in: a honeypot field bots fill in and humans can't see, required-field
validation with `aria-invalid` styling, and a status line wired to
`aria-live`.

---

## The SEO check

`assets/js/seo.js`, the `#check` section. Someone types their address, we read
their homepage the way a search engine would, and give them a score out of 100
plus the headroom above it. It's a lead magnet: the "get a quote to fix this"
button drops the address, the score and the flag count straight into the quote
form's message box.

Carried over from We Run Web unchanged apart from the contact address. It
still works — verified against a live site after the rebrand.

### What it actually reads

Three requests: the page itself, `/robots.txt` and `/sitemap.xml`. **It is not
a crawler** — it never follows a link. Fifteen checks are scored off those:
title, meta description, H1, H2s, image `alt` coverage, viewport, HTTPS,
canonical, Open Graph, JSON-LD, word count, internal link count, `lang`,
sitemap and robots.txt. Each has a weight; the fifteen add to 100. They live in
`runChecks()` and nowhere else, so that's the one place to tune.

A check we genuinely couldn't run — usually robots.txt when the raw proxies are
rate limited — is marked `skip`, and **its weight leaves the total on both
sides**, so the score is out of what we could actually see. Not being able to
look is never scored as a fault on their site.

The headroom is `(TARGET - score) / score`, where `TARGET` is 100. The divisor
has a floor of 8 so a site scoring 3 isn't told we can improve it by 3000%,
and the result is capped at 150%. **The copy says out loud that it's a lift on
the score, not a traffic promise.** Don't quietly reword that into one — we
can't back it.

### The grading curve

`CURVE`, at the top of `seo.js`, is an exponent applied to the raw fraction of
weight earned before the number is shown. At 1.4, a raw 68 shows as 58; 0 stays
0 and 100 stays 100, and it's the middle that tightens. **It changes how
generously the findings are added up, not the findings** — the list underneath
is the same either way, and the index is our own rubric, not anything Google
publishes. Set it to `1` to grade flat.

Worth being straight about what it's for: it was turned up to make the headroom
number look bigger. That's a defensible thing to do to an arbitrary index. What
isn't defensible is pairing a deflated score with a promise about traffic — so
if the copy ever drifts from "a lift on the score" toward "X% more customers",
turn `CURVE` back to 1 first.

### Three findings, then a gate

`SHOWN` in `render()` is 3. The list is sorted worst-first, so the three on
display are the three worth the most money to fix, and everything past them
sits behind one tile — *"and 8 more issues…"* — that links to `#quote`.

**The count is the true one.** "And 8 more" that turns out to be 8 is worth
something; "and 8 more" that turns out to be 2 is the reason nobody trusts
free SEO tools. The number comes straight off the same array the visible rows
come off.

Three is also what keeps the grid honest. `.seo__list` is two columns, so
3 + the gate is a clean 2×2, and 2 + the gate is three tiles where the
existing `.seo__row:last-child:nth-child(odd)` rule spans the gate across the
bottom. Change `SHOWN` to an even number and you get a stray empty tile back.

The gate is the only row that is a link, so the padding lives on the `<a>`
rather than the `<li>` and the whole tile is the hit area — a 13px uppercase
heading is not something anyone should have to aim at.

### The proxy, which you still need to replace

A browser can't fetch another origin and there's no back end, so the page comes
through a public reader. Measured 2026-09-03: `r.jina.ai` answered in 0.3s,
while `api.allorigins.win` and `api.codetabs.com` both rate limited inside a
single afternoon of testing, `corsproxy.io` wants a paid key, and `cors.lol`
and `thingproxy` are dead.

**That is the whole argument for `ENDPOINT`.** Put a ten-line Cloudflare Worker
behind it — fetch `?url=`, echo the body with an `Access-Control-Allow-Origin`
header — and set `ENDPOINT` at the top of `seo.js`. The public list is then
ignored.

`raw` on a proxy entry means it returns the file byte for byte. **Jina does
not** — it renders the page in a headless browser and hands back the DOM. For
the page that's an improvement: it's closer to what Google indexes. For
robots.txt and sitemap.xml it's useless, because it renders those too and gives
back the site's own text — so those two ask for a raw proxy only, and skip
rather than guess.

Timings: `TIMEOUT` 9s per attempt, 6s for robots.txt and sitemap.xml, and a
`DEADLINE` of 34s for the whole run, after which the visitor gets a "send it to
us and we'll look by hand" message rather than a button that looks stuck.

Sites behind Cloudflare's bot protection will refuse the proxy. That's handled
as an error message, not a zero — scoring a site we couldn't read would be
worse than admitting we couldn't read it.
