# Hero artwork

Two pieces, and they are treated completely differently.

```
branch-900.jpg           the branch — a PHOTOGRAPH, used as a photograph
branch-1400.jpg
branch-1672.jpg
canopy-1000.jpg          the #services backdrop
canopy-1537.jpg
jay legs.png             the bird, in three layers — dithered at runtime
jay leggless left.png
jay leggless right.png

jay-left.png             the whole bird, legs included. NOT loaded by the
jay-right.png            page any more; kept because the brand mark is
                         generated from jay-left.png

src/                     masters and the script that builds the sprites
```

## The canopy

`canopy-*.jpg` back the "what we do" section, under a green filter. Master
in `src/canopy-original.png` (1537x1023); 1537 is its own size, so there is
no upscale in the set.

It backs the **whole section**, not a band across its top, and it does that
without ever scaling the photo past one viewport: the artwork layer spans
the section and is clipped to it, while the photo inside is `position:
sticky` at one viewport tall. So the canopy holds still and the section
scrolls past it. Stretching the photo over the section instead would mean
upscaling it by 1.4x on a desktop and nearly 4x on a phone, where the
section runs to about 4000px once the cards stack.

`overflow:clip` on the artwork layer, with `hidden` as the fallback — both
clip, but `hidden` also makes it a scroll container, which silently kills
the sticky inside. Browsers without `clip` fall back to the artwork pinned
at the top of the section, not to a photo escaping down the page.

The filter's two alphas are solved together and documented in `styles.css`
under `.section__veil`. The thing to know before touching them: what you
see of the photo is `(1 - dark) x (1 - green)`, so the green tint is not
free. At .42 it was throwing away nearly half of what the darkening left,
only 16% of the canopy survived, and it read as a vague glow.

## The branch

A plain `<img>` with a `srcset`. Nothing in the JS touches it. Three widths
off one master (`src/branch-original.png`, 1672x941); 1672 is the master's
own size, so there is no upscale in the set.

**It is deliberately not dithered.** The fish-and-clouds site this was built
from ran its whole hero through a three-tone dither, and that worked because
the source was a pale sky: a big flat light area for the diffused error to
disappear into. A forest canopy has no such area — every cell is mid-tone and
busy, and the dither turns the whole frame to mud. So the photo stays a photo
and the dither is spent entirely on the bird, where it reads.

What sits on top of it is `.hero__veil` in `styles.css`, and the weight of
that grade is a measured number, not a taste call. See the comment there
before you change it; it was at `.90` for a while, which passed contrast
easily and also erased the photograph.

## The bird is three sprites, not one

```
jay legs.png             the legs and feet alone — painted once, never moves
jay leggless left.png    the body, head turned left  — bobs
jay leggless right.png   the body, head turned right — bobs
```

All three are drawn on the same 305x313 canvas, so they are **registered by
construction**: `bird.js` derives one origin (from the legs, the only sprite
with a foot in it) and lays all three on it. Nothing has to be measured and
handed over.

**The split is what lets the bird move at all.** As a single sprite, any
movement dragged the feet along with it — the drift had to shrink to
downward-only, and even before that a two-way version had the bird visibly
jiggling free of the branch it had been carefully placed on. With the legs
pinned the body is free in both axes and the feet cannot go anywhere:
`blit()` draws the legs at a literal `0, 0` and only the body layer takes
the offset.

`BOB_X` and `BOB_Y` are 1 cell each, sin against cos over one period, so
the body traces a slow circle rather than sliding along a diagonal. 5px
against a body ~200px tall and ~220px wide is breathing, not bouncing.

Order matters — **legs first, body over them.** A bird's thighs sit under
its belly feathers, and drawing the body on top is what hides the join as it
rides. The legs reach about 86 sprite-px up inside the body, and at the
widest point of the belly the body overhangs them by far more than a cell
in either direction — that overlap is what bounds the drift. Verified by
compositing all four corners of it: the feet hold and no gap opens.

The head turn holds each side for a **random** interval between `HOLD_MIN`
and `HOLD_MAX` rather than alternating on a beat — a fixed period reads as a
blinking GIF within a couple of cycles.

> ### The three layers are hand-made — `prep-bird.py` does not produce them
>
> Both source photographs catch the jay **mid-step, with its right foot
> lifted** about 100px clear of the other, which no placement can stand on a
> branch. The leg was lengthened by hand, and the result then separated by
> hand into the legs layer and the two legless bodies.
>
> None of that is in `src/left look.png` / `src/right look.png`.
> `prep-bird.py` only ever rebuilds `jay-left.png` / `jay-right.png` — the
> old combined sprites, which **the page no longer loads**. It will not
> silently clobber them either: it refuses to overwrite a file newer than
> its source without `--force`.

`jay-left.png` / `jay-right.png` were built from the supplied photos by
`src/prep-bird.py`:

```bash
cd assets/img/src && python prep-bird.py
```

That script does three things that matter, all documented in its docstring:
it finds the silhouette by **flooding white in from the border** rather than
thresholding on brightness (a jay's chest is nearly white, and a threshold
eats holes through it); it keeps only the **largest connected component**,
which discards a stray mark near the right edge of both source files; and it
crops both frames to **one shared box** so the body does not shift when the
head turns.

### Replacing the three layers

Requirements, in order of how badly they bite:

- **All three on one canvas, the same size, the bird in the same place.**
  They are blitted from a single shared origin, so anything that disagrees
  shows up as the body sliding off its own legs.
- **The legs layer must contain the lowest point of the bird**, because
  that toe is what gets stood on the branch. If a body layer reaches lower
  than the legs do, it will hang below them.
- **Enough overlap at the hip.** The body has to cover the tops of the legs
  by more than the bob travels, or a gap opens at the top of the movement.
- **One subject, nothing else in the frame.**

Then re-check `GAMMA` in `bird.js` — see below.

### What happens to them at runtime

Downsampled to one pixel per dither cell, tone-curved, Floyd-Steinberg error
diffusion against the palette's actual luminances, blitted back up with
smoothing off.

### Four inks

`PAL` in `bird.js`: a white, two blues and a black, at a **5px cell**.

```
WHITE  #F2F6FA   chest, cheek, wing bar
PALE   #A9C9E9   the light blue
BLUE   #4A7FBE   crest, back, wing, tail
BLACK  #16202B   bridle, eye, barring
```

It was two inks at a 4px cell to begin with, which read as speckle rather
than as a bird; four inks at 3px went the other way and came out almost
photographic. 5px with four inks is the chunky end that still carries the
crest, the bridle and the wing. The spread
is deliberately uneven: a jay is mostly pale chest and mid-blue wing, so
those two take the middle of the range, and BLACK is reserved for the bridle,
the eye and the barring — a small share of the bird, and the whole of its
face.

**Everything but BLACK is lighter than the canopy behind it**, which is the
one thing that matters here. A real jay against dark foliage is the *bright*
object in the frame; an earlier version inked in the bird's true deep blue
lost the entire topside — crest, back, wing, tail — into the photo and left a
floating pale chest. BLACK is only safe to include now because there is
enough light ink around it to carry the silhouette.

### The two knobs

**The tone curve is stretched between the photo's own black and white
points**, `SRC_BLACK` and `SRC_WHITE`, and `GAMMA` distributes the bird's
mass across the inks. It is **1.0** — a straight line. It was 1.4 back when
there were two inks and the curve was doing work the palette could not,
forcing enough weight into the dark ink to keep the crest and the bridle from
dissolving into the chest. Four inks do that unaided.

**`DIFFUSION` is 0.75**, where textbook Floyd-Steinberg is 1.0. Full
diffusion spends every scrap of quantisation error on speckle, and with four
inks — close enough together that the error per cell is small to begin with —
that speckle was the loudest thing left in the sprite. Holding it back lets
flat areas stay flat and leaves the dithering to the transitions, where it is
describing something. Much lower and it bands.

New photographs have a new exposure and will want `GAMMA` re-solved — score
candidates on local density error in 8x8 cell blocks, not on matching palette
percentages. Percentages are a summary; local density is what you see.

## The brand mark

The nav and footer mark is the same `jay-left.png`, downsampled to 26 cells
and split on luminance, inline in `index.html`. It is **not dithered**, and
that is the point: at 26 cells the error diffusion is wider than the bird's
features and the mark collapses into a rectangle of speckle. Solid blocks,
threshold 0.52.

Its two inks are `--jay-mid` (light block) and `--jay` (dark block), and they
are their own pair rather than the hero's. The mark is two areas of flat
colour at 26px, so it needs real separation to read; when the site went dark
both had to move up *and* apart, because the deep blue that worked on white
paper simply disappears on black.

## src/

Masters, not shipped to the browser but kept in the repo so the sprites can
be rebuilt:

- `branch-original.png` — the 1672x941 hero photo the three JPEGs come from
- `left look.png`, `right look.png` — the supplied jay photos
- `prep-bird.py` — builds `jay-left.png` / `jay-right.png` from those two
