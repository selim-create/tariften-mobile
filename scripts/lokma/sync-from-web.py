"""Regenerate lib/lokma-svg-art.ts from tariften-web's LokmaIngredientIcon.tsx.

Usage: python3 scripts/lokma/sync-from-web.py <web LokmaIngredientIcon.tsx> lib/lokma-svg-art.ts
JSX attributes become SVG attributes; {shine}/{dark} become their colours.
"""
import json, re, sys

src = open(sys.argv[1], encoding="utf-8").read()
consts = dict(re.findall(r'const (\w+) = "(#[0-9a-fA-F]{3,8})";', src))
blocks = re.findall(r'\{figure === "([a-z0-9_-]+)" && <>(.*?)</>\}', src, re.S)

def kebab(m):
    name = m.group(1)
    return re.sub(r'([A-Z])', lambda c: '-' + c.group(1).lower(), name) + '='

out = {}
for name, body in blocks:
    body = body.strip()
    body = re.sub(r'=\{(\w+)\}', lambda m: '="%s"' % consts.get(m.group(1), m.group(1)), body)
    body = re.sub(r'=\{([0-9.\-]+)\}', r'="\1"', body)
    body = re.sub(r'\b([a-z]+[A-Z][A-Za-z]*)=', kebab, body)
    if '{' in body or '}' in body:
        raise SystemExit(f"unconverted expression in {name}: {body[:120]}")
    out[name] = body

header = f'''/**
 * TARİFTEN / LOKMA — brand food miniature vector art ({len(out)} figures).
 *
 * Generated from tariften-web src/components/lokma/LokmaIngredientIcon.tsx by
 * scripts/lokma/sync-from-web.py — do not edit by hand; rerun the script.
 * SVG markup is packaged locally and converted to stable offline data URIs;
 * no third-party images, additional font, CDN, AI request or native module.
 * Include every figure, including a neutral plate fallback for unknown names.
 *
 * Source of ingredient truth remains its original accessible text.
 */
export const LOKMA_SVG_ART: Readonly<Record<string, string>> = {{
'''
lines = [f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}," for k, v in out.items()]
footer = '''};

export const LOKMA_FIGURES = Object.freeze(Object.keys(LOKMA_SVG_ART));
const SVG_URI: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(LOKMA_FIGURES.map(key => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40" fill="none" stroke-linecap="round" stroke-linejoin="round">${LOKMA_SVG_ART[key]}</svg>`;
    return [key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`];
  })),
);
export function lokmaArtUri(figure: string): string {
  return SVG_URI[figure] || SVG_URI.plate;
}
'''
open(sys.argv[2], "w", encoding="utf-8").write(header + "\n".join(lines) + "\n" + footer)
print(len(out), "figures")
