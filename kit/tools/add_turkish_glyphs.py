#!/usr/bin/env python3
"""Add Turkish glyphs to the bundled Ubuntu bitmap font atlases."""
import base64
import json
import zlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = ROOT / 'kit' / 'tools' / 'font-source'
ATLAS_DIR = ROOT / 'kit' / 'runtime' / 'fonts'
FAMILIES = {
    'label': 'Ubuntu-Regular.ttf',
    'bold': 'Ubuntu-Bold.ttf',
    'light': 'Ubuntu-Light.ttf',
}
GLYPHS = 'ÇĞİÖŞÜçğıöşüÂÎÛâîû'


def extend_atlas(path, font_path):
    data = json.loads(path.read_text(encoding='utf-8'))
    data['cacheKey'] = 'turkish-v1'
    for entry in data['sizes']:
        glyphs = entry['glyphs']
        missing = [char for char in GLYPHS if str(ord(char)) not in glyphs]
        if not missing:
            continue

        width, old_height = entry['atlasW'], entry['atlasH']
        alpha = zlib.decompress(base64.b64decode(entry['alpha']))
        atlas = Image.frombytes('L', (width, old_height), alpha)
        draw = ImageDraw.Draw(atlas)
        font = ImageFont.truetype(str(font_path), entry['size'])
        x, y, row_height = 0, old_height, 0

        for char in missing:
            left, top, right, bottom = font.getbbox(char, anchor='ls')
            glyph_width, glyph_height = right - left, bottom - top
            if x and x + glyph_width > width:
                y += row_height + 1
                x, row_height = 0, 0
            if y + glyph_height > 4096:
                raise ValueError(f'{path.name}: atlas would exceed 4096 px')
            draw.text((x - left, y - top), char, font=font, fill=255, anchor='ls')
            glyphs[str(ord(char))] = [x, y, glyph_width, glyph_height, left, top, font.getlength(char)]
            x += glyph_width + 1
            row_height = max(row_height, glyph_height)

        new_height = y + row_height
        entry['atlasH'] = new_height
        entry['alpha'] = base64.b64encode(zlib.compress(atlas.crop((0, 0, width, new_height)).tobytes(), 9)).decode('ascii')

    path.write_text(json.dumps(data, separators=(',', ':')) + '\n', encoding='utf-8')


def main():
    for family, filename in FAMILIES.items():
        extend_atlas(ATLAS_DIR / f'{family}.json', FONT_DIR / filename)


if __name__ == '__main__':
    main()
