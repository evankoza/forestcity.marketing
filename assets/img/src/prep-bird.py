#!/usr/bin/env python3
"""
Turn the supplied blue jay photos into hero sprite frames.

Input:  "left look.png", "right look.png" — the jay on a WHITE ground.
Output: ../jay-left.png, ../jay-right.png — the same jay with a real alpha
        channel, both cropped to one shared box.

Three things this has to get right, and all three have bitten:

1. THE BACKGROUND IS WHITE, NOT TRANSPARENT. The supplied files are fully
   opaque; what looks like transparency is paint. So the silhouette has to be
   found, not read off the alpha channel.

2. IT IS FOUND BY FLOOD FILL FROM THE BORDER, not by thresholding on
   whiteness. A jay's chest and cheek are very pale, and a plain "everything
   lighter than X is background" rule eats holes straight through the bird.
   Flooding inward from the edge can only reach white that is CONNECTED to
   the outside, so an enclosed pale chest survives however bright it is.

3. BOTH FRAMES ARE CROPPED TO ONE UNION BOX. The two photos share a body and
   differ only at the head. Cropped independently, their differing head
   extents would shift the body between frames and the bird would twitch.

There is also a stray grey mark near the right edge of both source files,
about 36 pixels in one column. Keeping only the largest connected component
drops it — left in, it would widen the ink box and shrink the bird inside it.

    python prep-bird.py            # refuses to clobber edited sprites
    python prep-bird.py --force   # rebuild anyway

!!! WHAT THIS WRITES IS NO LONGER WHAT THE PAGE LOADS. !!!

The hero now uses three hand-made layers — 'jay legs.png' and the two
'jay leggless *.png' bodies — so that the legs can stay planted while
the body bobs. This script still produces the old combined sprites,
which are kept only because the brand mark is generated from
jay-left.png.

The original photographs catch the jay mid-step with its right foot lifted
about 100px clear of the other, which no placement can stand on a branch.
That leg was lengthened by hand in ../jay-left.png and ../jay-right.png so
both feet land within about 20px of each other.

Those edits are NOT in "left look.png" / "right look.png", so re-running
this script plainly would throw them away and the bird would go back to
hovering. Hence the guard below: it will not overwrite an output that is
newer than its input unless you pass --force.

Requires Pillow, numpy, scipy.
"""

import os
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
# the two supplied photos live beside this script, in src/

SOURCES = [('left look.png', 'jay-left.png'),
           ('right look.png', 'jay-right.png')]

WHITE_AT = 246      # luminance at or above this is candidate background
PAD = 3             # px of clear space kept around the union box


def silhouette(rgb):
    """Boolean mask of the bird: everything not reachable as white from the
    border, largest component only, holes filled."""
    lum = rgb[..., 0] * .299 + rgb[..., 1] * .587 + rgb[..., 2] * .114
    white = lum >= WHITE_AT

    # Flood the white region inward from the image border. ndimage gives us
    # this as "label the white blobs, then keep the ones touching an edge".
    lab, n = ndimage.label(white)
    edge = set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) | \
           set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    edge.discard(0)
    background = np.isin(lab, list(edge))

    subject = ~background
    # largest component only — this is what discards the stray mark
    lab2, n2 = ndimage.label(subject)
    if n2 > 1:
        sizes = ndimage.sum(subject, lab2, range(1, n2 + 1))
        subject = lab2 == (int(np.argmax(sizes)) + 1)
    subject = ndimage.binary_fill_holes(subject)
    # Erode by one pixel. The supplied files were matted against white, so
    # the outermost ring of bird pixels is part bird and part background —
    # left in, it draws a pale halo right around the bird once it is sitting
    # on a dark canopy. One pixel is enough and costs nothing at the size
    # this is eventually dithered to.
    return ndimage.binary_erosion(subject, iterations=1)


def guard(force):
    """Refuse to discard hand edits made to the sprites after they were
    last generated."""
    if force:
        return
    for src, out in SOURCES:
        o = os.path.join(HERE, '..', out)
        i = os.path.join(HERE, src)
        if os.path.exists(o) and os.path.getmtime(o) > os.path.getmtime(i) + 1:
            raise SystemExit(
                '%s is newer than %s, so it has been edited since it was '
                'generated - the right leg was lengthened by hand. '
                'Re-running would discard that. Pass --force if you mean to.'
                % (out, src))


def main():
    guard('--force' in sys.argv)
    loaded = []
    for src, out in SOURCES:
        path = os.path.join(HERE, src)
        if not os.path.exists(path):
            raise SystemExit('missing source: %s' % path)
        rgb = np.array(Image.open(path).convert('RGB')).astype(np.float64)
        loaded.append((out, rgb, silhouette(rgb)))

    # one union box across every frame
    y0 = min(np.nonzero(m.any(axis=1))[0].min() for _, _, m in loaded)
    y1 = max(np.nonzero(m.any(axis=1))[0].max() for _, _, m in loaded)
    x0 = min(np.nonzero(m.any(axis=0))[0].min() for _, _, m in loaded)
    x1 = max(np.nonzero(m.any(axis=0))[0].max() for _, _, m in loaded)
    h, w = loaded[0][2].shape
    y0, x0 = max(0, y0 - PAD), max(0, x0 - PAD)
    y1, x1 = min(h - 1, y1 + PAD), min(w - 1, x1 + PAD)
    print('union box x %d..%d  y %d..%d  (%dx%d)' % (x0, x1, y0, y1, x1 - x0 + 1, y1 - y0 + 1))

    for out, rgb, mask in loaded:
        sub = rgb[y0:y1 + 1, x0:x1 + 1]
        m = mask[y0:y1 + 1, x0:x1 + 1]
        im = Image.fromarray(sub.astype(np.uint8), 'RGB')
        alpha = Image.fromarray((m * 255).astype(np.uint8), 'L')
        # half a pixel of feather, so the dither has a soft edge to diffuse
        # into rather than a staircase
        alpha = alpha.filter(ImageFilter.GaussianBlur(0.5))
        im.putalpha(alpha)
        p = os.path.join(HERE, '..', out)
        im.save(p)
        print('wrote %-14s %s  ink %d px' % (out, im.size, int(m.sum())))


if __name__ == '__main__':
    main()
