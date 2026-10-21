"""
Builds the native app icons and the splash mark from assets/tariften-icon.svg
(the geometric logo glyph). Run from the repo root:  python3 scripts/brand/build_app_icons.py
Requires skia-python and Pillow. Output is deterministic.

  assets/icon.png                 iOS light / default icon (opaque, 1024)
  assets/icon-dark.png            iOS 18 dark icon (transparent, brand glyph)
  assets/icon-tinted.png          iOS 18 tinted icon (transparent, white glyph)
  assets/icon-dev.png             Tariften DEV build (ink tile) so it never looks like production
  assets/android-icon-foreground.png / -monochrome.png / -background.png
  assets/splash-icon.png          splash mark (rounded brand tile, transparent around)
"""
import re
import skia
from PIL import Image

SRC = 'assets/tariften-icon.svg'
S = 1024
BRAND_TOP, BRAND_BOTTOM = 0xFFE15446, 0xFFD0443A   # subtle top-lit red, same hue as #DB4C3F
INK_TOP, INK_BOTTOM = 0xFF2A231F, 0xFF16120F


def parse(d):
    p = skia.Path()
    tokens = re.findall(r'[MLQZ]|-?\d*\.?\d+', d)
    i, cmd = 0, None
    def num():
        nonlocal i
        v = float(tokens[i]); i += 1; return v
    while i < len(tokens):
        t = tokens[i]
        if t in 'MLQZ':
            cmd = t; i += 1
            if cmd == 'Z':
                p.close(); continue
        if cmd == 'M': p.moveTo(num(), num()); cmd = 'L'
        elif cmd == 'L': p.lineTo(num(), num())
        elif cmd == 'Q':
            x1, y1 = num(), num(); p.quadTo(x1, y1, num(), num())
    return p


svg = open(SRC).read()
glyph = parse(re.search(r'<path fill="#FFFFFF" d="([^"]+)"', svg).group(1))
glyph.setFillType(skia.PathFillType.kWinding)
b = glyph.computeTightBounds()
gw, gh = b.width(), b.height()


def placed(scale_of_canvas, size=S, dy=0.0):
    """Glyph scaled so its larger side is `scale_of_canvas` of the canvas, optically centred."""
    k = scale_of_canvas * size / max(gw, gh)
    m = skia.Matrix()
    m.setTranslate(-b.centerX(), -b.centerY())
    m.postScale(k, k)
    m.postTranslate(size / 2, size / 2 + dy * size)
    out = skia.Path(glyph)
    out.transform(m)
    return out


def render(draw, size=S, opaque=False):
    surface = skia.Surface(size, size)
    c = surface.getCanvas()
    c.clear(skia.Color4f(0, 0, 0, 0) if not opaque else skia.Color4f(1, 1, 1, 1))
    draw(c, size)
    return surface.makeImageSnapshot()


def save(img, path, mode='RGBA'):
    img.save(path, skia.kPNG)
    Image.open(path).convert(mode).save(path, optimize=True)


def gradient(top, bottom, size):
    return skia.GradientShader.MakeLinear([(0, 0), (0, size)], [top, bottom])


def full_bg(top, bottom):
    def draw(c, size):
        c.drawRect(skia.Rect(0, 0, size, size), skia.Paint(Shader=gradient(top, bottom, size), AntiAlias=True))
    return draw


def glyph_paint(color):
    return skia.Paint(Color=color, AntiAlias=True)


# iOS light: brand tile edge to edge (iOS applies the squircle mask), glyph at 0.58.
save(render(lambda c, s: (full_bg(BRAND_TOP, BRAND_BOTTOM)(c, s), c.drawPath(placed(0.58), glyph_paint(skia.ColorWHITE)))),
     'assets/icon.png', 'RGB')
# iOS dark: transparent, the system paints the dark backdrop; brand glyph a touch lighter for contrast.
save(render(lambda c, s: c.drawPath(placed(0.58), glyph_paint(0xFFF0675A))), 'assets/icon-dark.png')
# iOS tinted: transparent, white glyph; the system applies the user's tint.
save(render(lambda c, s: c.drawPath(placed(0.58), glyph_paint(skia.ColorWHITE))), 'assets/icon-tinted.png')
# DEV build: ink tile so the test app is never mistaken for the store app.
save(render(lambda c, s: (full_bg(INK_TOP, INK_BOTTOM)(c, s), c.drawPath(placed(0.58), glyph_paint(0xFFF0675A)))),
     'assets/icon-dev.png', 'RGB')

# Android adaptive: 108dp canvas, 66dp safe circle -> glyph within ~0.38 of the canvas (fits the 66dp safe circle).
save(render(lambda c, s: full_bg(BRAND_TOP, BRAND_BOTTOM)(c, s)), 'assets/android-icon-background.png', 'RGB')
save(render(lambda c, s: c.drawPath(placed(0.38), glyph_paint(skia.ColorWHITE))), 'assets/android-icon-foreground.png')
save(render(lambda c, s: c.drawPath(placed(0.38), glyph_paint(skia.ColorWHITE))), 'assets/android-icon-monochrome.png')


# Splash mark: rounded brand tile (same radius ratio as the logo tile) with the glyph.
def splash(c, s):
    tile = s * 0.5
    x0 = (s - tile) / 2
    rect = skia.RRect.MakeRectXY(skia.Rect(x0, x0, x0 + tile, x0 + tile), tile * 0.235, tile * 0.235)
    c.drawRRect(rect, skia.Paint(Shader=skia.GradientShader.MakeLinear([(0, x0), (0, x0 + tile)], [BRAND_TOP, BRAND_BOTTOM]), AntiAlias=True))
    c.drawPath(placed(0.58 * 0.5), glyph_paint(skia.ColorWHITE))
save(render(splash), 'assets/splash-icon.png')
print('ok', round(gw), round(gh))
