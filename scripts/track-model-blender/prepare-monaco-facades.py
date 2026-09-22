"""Original tileable facade materials; visual reconstruction, not survey photos."""
from PIL import Image, ImageDraw
import random


def prepare_facades(output):
    for variant, plaster in enumerate(((214, 208, 192), (226, 218, 199), (205, 176, 154), (192, 197, 191))):
        size = 512
        image = Image.new('RGB', (size, size))
        noise = random.Random(260922 + variant)
        image.putdata([tuple(max(0, min(255, c + noise.randrange(-4, 5))) for c in plaster)
                       for _ in range(size * size)])
        draw = ImageDraw.Draw(image)
        # One bay / storey. Broad surrounds survive browser mipmapping;
        # recessed glass and thin highlights read at closer viewing distances.
        trim = tuple(min(255, c + 18) for c in plaster)
        shadow = tuple(max(0, c - 35) for c in plaster)
        if variant == 3:
            left, right = 72, 440
        else:
            left, right = 133, 379
        draw.rectangle((left - 13, 80, right + 14, 415), fill=shadow)
        draw.rectangle((left - 17, 72, right + 9, 404), fill=trim)
        draw.rectangle((left, 89, right - 7, 384), fill=(60, 71, 74))
        draw.polygon(((left + 8, 95), (right - 15, 95), (right - 15, 171), (left + 8, 298)), fill=(87, 100, 103))
        draw.polygon(((left + 8, 95), (left + 37, 95), (left + 37, 370), (left + 8, 370)), fill=(112, 121, 119))
        middle = (left + right) // 2
        for x in (left, middle, right - 9):
            draw.rectangle((x, 87, x + 7, 387), fill=(192, 192, 180))
        draw.rectangle((left, 229, right - 4, 236), fill=(183, 185, 176))
        draw.rectangle((left - 20, 404, right + 18, 417), fill=shadow)
        draw.rectangle((left - 24, 399, right + 17, 407), fill=trim)
        if variant == 1:
            # Muted shutters flanking the opening.
            for x in (62, 395):
                draw.rectangle((x, 83, x + 49, 395), fill=(100, 112, 99))
                for y in range(92, 390, 14):
                    draw.line((x + 3, y, x + 46, y), fill=(74, 87, 76), width=3)
        if variant in (0, 2):
            draw.rectangle((0, 477, 511, 491), fill=shadow)
            draw.rectangle((0, 475, 511, 482), fill=trim)
            for x in range(left - 25, right + 22, 27):
                draw.line((x, 328, x, 410), fill=(76, 78, 74), width=4)
            draw.line((left - 26, 328, right + 25, 328), fill=(72, 75, 72), width=6)
        image.save(output / f'monaco-facade-{variant}.jpg', quality=88, optimize=True)
