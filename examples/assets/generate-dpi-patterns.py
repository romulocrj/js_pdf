# js_pdf original image DPI gallery assets.
# Copyright (C) 2026, Romulo Campos
# Licensed under the Apache License, Version 2.0.

"""Optional asset regeneration with Pillow; not a build/runtime dependency."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
image = Image.new('RGB', (320, 160))
image.putdata([(int(x * 255 / 319), int(y * 255 / 159), 135)
               for y in range(160) for x in range(320)])
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 319, 8), fill='#facc15')
draw.rectangle((0, 0, 42, 42), fill='#ef4444')
draw.line((0, 159, 319, 0), fill='#172554', width=5)
for x in range(200, 300, 6):
    draw.line((x, 90, x, 145), fill='white', width=1)
draw.ellipse((65, 40, 135, 110), outline='white', width=4)
image.save(root / 'dpi-pattern.jpg', quality=95, subsampling=0)

alpha = Image.new('RGBA', (320, 160), (0, 0, 0, 0))
draw = ImageDraw.Draw(alpha)
draw.rectangle((30, 25, 180, 135), fill=(239, 68, 68, 128))
draw.ellipse((130, 10, 285, 150), fill=(59, 130, 246, 150))
draw.line((15, 145, 305, 15), fill=(16, 185, 129, 210), width=6)
alpha.save(root / 'dpi-alpha.png')
