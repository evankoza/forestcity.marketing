"""Digitise the hat front: the jay on the left, the name stacked on the right.

The bird is read straight out of index.html (the nav's brand__mark rects),
the same way assets/img/src/mark2png.js does, so the hat carries the mark
cell for cell. The name is set in the site's wordmark face, Bricolage
Grotesque ExtraBold, one word per line with Ltd. riding on the last,
cap-top to the bird's crest and baseline to its tail.

Everything is tatami fill over a sparse cross-grain underlay: three thread colours,
light blue, mid blue, then black for the bird's dark cells and the lettering
in the same pass.

Usage: python hat.py <index.html> <BricolageGrotesque[...].ttf> <outdir>
Needs: pyembroidery, shapely, fonttools.
"""

import math
import os
import re
import sys

import pyembroidery as pe
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.ops import unary_union

SRC, FONT, OUT = sys.argv[1:4]

# ---- sizes, all mm -------------------------------------------------------
HEIGHT = 30.0        # bird, crest to tail, and the text block, cap to baseline
GAP = 5.0            # bird to text
WORDS = ["London", "Marketing", "Solutions Ltd."]
LINE_GAP_RATIO = 0.5   # gap between lines as a fraction of cap height

ROW = 0.42           # fill row spacing
STITCH = 3.0         # longest top stitch
UNDER_ROW = 1.6      # underlay row spacing
PULL = 0.18          # pull compensation, added all round
TRIM_OVER = 1.2      # connections longer than this become a trim + jump

INKS = {  # token in index.html -> (thread name, rgb)
    "--jay-mid": ("Light blue", (0xC2, 0xD9, 0xF0)),
    "--jay": ("Mid blue", (0x5A, 0x8F, 0xC7)),
    "--jay-dark": ("Black", (0x00, 0x00, 0x00)),
}

# ---- the bird ------------------------------------------------------------
html = open(SRC, encoding="utf8").read()
s0 = html.index('<svg class="brand__mark"')
svg = html[s0:html.index("</svg>", s0)]
cells = {}
for g in svg.split('<g fill="var(')[1:]:
    token = "--" + g[2:g.index(")")]
    rects = [tuple(map(int, m)) for m in
             re.findall(r'<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/>', g)]
    cells[token] = rects
allr = [r for rs in cells.values() for r in rs]
cx0 = min(r[0] for r in allr); cy0 = min(r[1] for r in allr)
cx1 = max(r[0] + r[2] for r in allr); cy1 = max(r[1] + r[3] for r in allr)
CELL = HEIGHT / (cy1 - cy0)
BIRD_W = (cx1 - cx0) * CELL

def bird_shape(token):
    return unary_union([box((x - cx0) * CELL, (y - cy0) * CELL,
                            (x - cx0 + w) * CELL, (y - cy0 + h) * CELL)
                        for x, y, w, h in cells[token]])

# ---- the words -----------------------------------------------------------
font = TTFont(FONT)
font = instantiateVariableFont(font, {"wght": 800, "opsz": 14, "wdth": 100})
UPEM = font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight
gs = font.getGlyphSet()
cmap = font.getBestCmap()
hmtx = font["hmtx"]

class Flat(BasePen):
    def __init__(self, gs):
        super().__init__(gs); self.contours = []; self.cur = None
    def _moveTo(self, p): self.cur = [p]
    def _lineTo(self, p): self.cur.append(p)
    def _curveToOne(self, a, b, c):
        p0 = self.cur[-1]
        for i in range(1, 9):
            t = i / 8; u = 1 - t
            self.cur.append(tuple(u**3*p0[k] + 3*u*u*t*a[k] + 3*u*t*t*b[k] + t**3*c[k] for k in (0, 1)))
    def _qCurveToOne(self, a, b):
        p0 = self.cur[-1]
        for i in range(1, 7):
            t = i / 6; u = 1 - t
            self.cur.append(tuple(u*u*p0[k] + 2*u*t*a[k] + t*t*b[k] for k in (0, 1)))
    def _closePath(self):
        if len(self.cur) > 2: self.contours.append(self.cur)
        self.cur = None
    _endPath = _closePath

def signed_area(pts):
    return sum(pts[i][0]*pts[i-1][1] - pts[i-1][0]*pts[i][1] for i in range(len(pts))) / 2

def word_shape(word):
    """Font units, y up, baseline at 0, starting at x 0."""
    outers, holes, x = [], [], 0
    for ch in word:
        gname = cmap[ord(ch)]  # space has an advance and no contours
        pen = Flat(gs); gs[gname].draw(pen)
        for c in pen.contours:
            poly = Polygon([(px + x, py) for px, py in c]).buffer(0)
            # TrueType outers wind clockwise: negative area with y up.
            (outers if signed_area(c) > 0 else holes).append(poly)
        x += hmtx[gname][0]
    return unary_union(outers).difference(unary_union(holes))

cap_mm = HEIGHT / (3 + 2 * LINE_GAP_RATIO)
scale = cap_mm / CAP
text = []
for i, w in enumerate(WORDS):
    g = word_shape(w)
    g = affinity.scale(g, scale, -scale, origin=(0, 0))       # mm, y down
    minx = g.bounds[0]
    baseline = cap_mm + i * cap_mm * (1 + LINE_GAP_RATIO)
    text.append(affinity.translate(g, BIRD_W + GAP - minx, baseline))
TEXT = unary_union(text)

W = TEXT.bounds[2]
print(f"design {W:.1f} x {HEIGHT:.1f} mm  (bird {BIRD_W:.1f} wide, cap height {cap_mm:.1f} mm)")

# ---- fill ----------------------------------------------------------------
def polys(g):
    if g.is_empty: return []
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]

def scan_blocks(poly, spacing):
    """Cut a polygon into runs of scanlines that can each be sewn as one
    serpentine without leaving the shape."""
    minx, miny, maxx, maxy = poly.bounds
    blocks, active = [], []   # active: (block, last interval)
    y = miny + spacing / 2
    while y < maxy:
        seg = poly.intersection(LineString([(minx - 1, y), (maxx + 1, y)]))
        ivs = sorted([tuple(sorted((l.coords[0][0], l.coords[-1][0])))
                      for l in (getattr(seg, "geoms", None) or [seg]) if not l.is_empty
                      and l.geom_type == "LineString" and l.length > 0.05])
        nxt = []
        for iv in ivs:
            hits = [a for a in active if a[1][0] < iv[1] and iv[0] < a[1][1]]
            if len(hits) == 1 and sum(1 for j in ivs if hits[0][1][0] < j[1] and j[0] < hits[0][1][1]) == 1:
                blk = hits[0][0]
            else:
                blk = []; blocks.append(blk)
            blk.append((y, iv)); nxt.append((blk, iv))
        active = nxt
        y += spacing
    return blocks

def row_points(y, x0, x1, row_i, reverse, length):
    """One fill row with tatami stagger, so needle holes don't line up."""
    off = (row_i % 3) * length / 3
    xs = [x0]
    k = x0 - (x0 % length) + off
    while k < x1:
        if k - xs[-1] > 0.5 and x1 - k > 0.5: xs.append(k)
        k += length
    xs.append(x1)
    if reverse: xs.reverse()
    return [(x, y) for x in xs]

def fill(geom, angle, spacing, length):
    """Returns a list of stitch runs (lists of points), one per block."""
    runs = []
    for p in polys(geom):
        rp = affinity.rotate(p, -angle, origin=(0, 0))
        for blk in scan_blocks(rp, spacing):
            pts = []
            for i, (y, (x0, x1)) in enumerate(blk):
                pts += row_points(y, x0, x1, i, i % 2 == 1, length)
            if pts:
                runs.append([affinity.rotate(LineString([q, q]), angle, origin=(0, 0)).coords[0]
                             for q in pts])
    return runs

def region(geom):
    """Underlay then top fill for each separate piece, so each piece is sewn
    in one go and the machine only jumps between pieces."""
    out = []
    for p in polys(geom.buffer(PULL, join_style=2)):
        under = p.buffer(-0.35, join_style=2)
        piece = chain(fill(under, 90, UNDER_ROW, STITCH))
        piece += chain(fill(p, 0, ROW, STITCH))
        out.append((p, piece))
    return out

def chain(runs):
    """Order a piece's top-fill blocks so each starts near where the last
    ended, flipping a block end for end when that is closer."""
    if not runs: return runs
    done = [runs.pop(0)]
    while runs:
        end = done[-1][-1]
        best = min([(math.dist(end, r[0]), i, False) for i, r in enumerate(runs)] +
                   [(math.dist(end, r[-1]), i, True) for i, r in enumerate(runs)])
        r = runs.pop(best[1])
        done.append(r[::-1] if best[2] else r)
    return done

def order(pieces):
    """Nearest-neighbour order, starting from the left."""
    left = sorted(pieces, key=lambda pc: pc[1][0][0][0])
    done = [left.pop(0)]
    while left:
        end = done[-1][1][-1][-1]
        i = min(range(len(left)), key=lambda j: math.dist(end, left[j][1][0][0]))
        done.append(left.pop(i))
    return done

# ---- sew -----------------------------------------------------------------
pat = pe.EmbPattern()
pat.metadata("name", "LMS HAT")  # what the machine screen shows
layers = [
    ("--jay-mid", bird_shape("--jay-mid")),
    ("--jay", bird_shape("--jay")),
    ("--jay-dark", unary_union([bird_shape("--jay-dark"), TEXT])),
]
TIE = 0.7  # lock stitch length, mm

_at = [None]
def st(x, y):
    """Drop stitches under 0.25 mm: they only hammer one hole and fray thread."""
    if _at[0] and math.dist(_at[0], (x, y)) < 0.25: return
    pat.add_stitch_absolute(pe.STITCH, x * 10, y * 10); _at[0] = (x, y)

def tie(p, toward):
    """Three short stitches back and forth along the path, so the thread
    holds after the machine trims it. Sewn inside the shape, so covered."""
    d = math.dist(p, toward)
    if d < 1e-6: return
    ux, uy = (toward[0] - p[0]) / d * TIE, (toward[1] - p[1]) / d * TIE
    for _ in range(2):
        st(p[0] + ux, p[1] + uy); st(*p)

def stitch_to(last, q):
    """Straight line of stitches, none longer than STITCH."""
    k = math.ceil(math.dist(last, q) / STITCH)
    for j in range(1, k):
        st(last[0] + (q[0] - last[0]) * j / k, last[1] + (q[1] - last[1]) * j / k)
    st(*q)

for ci, (token, geom) in enumerate(layers):
    name, rgb = INKS[token]
    th = pe.EmbThread(); th.set_color(*rgb); th.description = name
    pat.add_thread(th)
    if ci: pat.add_command(pe.COLOR_CHANGE)
    last = None
    for shape, piece in order(region(geom)):
        inside = shape.buffer(0.05)
        pts = [q for run in piece for q in run]
        for ri, run in enumerate(piece):
            for i, q in enumerate(run):
                if last is None or (ri == 0 and i == 0 and math.dist(last, q) > TRIM_OVER):
                    # new piece: trim, jump, lock in
                    if last is not None: pat.add_command(pe.TRIM)
                    pat.add_stitch_absolute(pe.JUMP, q[0] * 10, q[1] * 10); _at[0] = None
                    st(*q)
                    tie(q, next(p for p in pts[1:] if math.dist(p, q) > 0.3))
                elif i == 0 and math.dist(last, q) > TRIM_OVER and not inside.contains(LineString([last, q])):
                    # a hop that would leave the shape: lock off, trim, lock in
                    tie(last, before)
                    pat.add_command(pe.TRIM)
                    pat.add_stitch_absolute(pe.JUMP, q[0] * 10, q[1] * 10); _at[0] = None
                    st(*q)
                    tie(q, run[1] if len(run) > 1 else last)
                else:
                    stitch_to(last, q)
                if last is not None and math.dist(last, q) > 0.3: before = last
                last = q
        # lock off at the end of the piece, back along the last stitch
        tie(last, before)
pat.add_command(pe.END)

def preview(pat, path, px_per_mm=12, bg=(236, 232, 224)):
    """Draw sewn stitches only (no jumps), each as a strand of thread."""
    from PIL import Image, ImageDraw
    b = pat.bounds(); m = 4
    k = px_per_mm / 10
    im = Image.new("RGB", (int((b[2] - b[0]) * k) + 2 * m * px_per_mm,
                           int((b[3] - b[1]) * k) + 2 * m * px_per_mm), bg)
    d = ImageDraw.Draw(im)
    lw = max(2, round(0.38 * px_per_mm))
    cols = [t.hex_color() for t in pat.threadlist]
    ci, prev = 0, None
    xy = lambda s: ((s[0] - b[0]) * k + m * px_per_mm, (s[1] - b[1]) * k + m * px_per_mm)
    for s in pat.stitches:
        c = s[2] & pe.COMMAND_MASK
        if c == pe.COLOR_CHANGE:
            ci += 1; prev = None
        elif c == pe.STITCH:
            if prev: d.line([xy(prev), xy(s)], fill=cols[ci], width=lw)
            prev = s
        else:
            prev = None
    im.save(path)

# centre on the hoop origin, as Brother machines expect
b = pat.bounds()
pat.translate(-(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2)

os.makedirs(OUT, exist_ok=True)
base = os.path.join(OUT, "LMS_HAT")  # short: the machine's file list is narrow
pe.write_pes(pat, base + ".pes", {"pes version": 1})
pe.write_dst(pat, base + ".dst")
preview(pat, base + "-preview.png")

stitches = sum(1 for s in pat.stitches if (s[2] & pe.COMMAND_MASK) == pe.STITCH)
jumps = sum(1 for s in pat.stitches if (s[2] & pe.COMMAND_MASK) == pe.TRIM)
print(f"{stitches} stitches, {jumps} trims, {len(layers)} colours")

# flat artwork, for reference and for re-digitising elsewhere
def path_d(g):
    d = []
    for p in polys(g):
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)
            d.append("M" + " L".join(f"{x:.3f},{y:.3f}" for x, y in c) + "Z")
    return " ".join(d)
with open(base + ".svg", "w") as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.2f}mm" height="{HEIGHT:.2f}mm" '
            f'viewBox="0 0 {W:.3f} {HEIGHT:.3f}">\n')
    for token, geom in layers:
        f.write(f'  <path fill="#{"%02X%02X%02X" % INKS[token][1]}" fill-rule="evenodd" d="{path_d(geom)}"/>\n')
    f.write("</svg>\n")
