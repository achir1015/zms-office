"""產生程式圖示：web/assets/icon.png（1024）、icon-256、icon-180（iPhone）、icon-192／512（PWA）、packaging/icon.ico。

資料助秘系列的深藍到青綠圓角方塊；中間是扇形排開的三張文件（藍 W 文書、綠 X 試算表、橘 P 簡報），
右下角紫色流程圖小卡，上方「文件office」標題列，左下角「資料助秘」標籤。
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(size, weight="Black"):
    try:
        f = ImageFont.truetype(os.path.join(HERE, "web", "assets", "fonts", "NotoSansTC-VF.ttf"), size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        return f
    except Exception:
        return ImageFont.load_default()


def sheet(color, letter, kind):
    """一張文件：白紙＋左上彩色標籤＋內容示意（文字行／格線／投影片）。"""
    w, h = 400, 500
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=26, fill=(252, 252, 250, 255))
    d.polygon([(w - 90, 0), (w, 90), (w - 90, 90)], fill=(220, 225, 232, 255))
    if kind == "word":
        for i, y in enumerate(range(200, 460, 40)):
            d.rounded_rectangle([50, y, w - (90 if i % 3 == 2 else 50), y + 16], radius=8, fill=(190, 205, 225, 255))
    elif kind == "cell":
        for y in range(190, 470, 52):
            d.line([(40, y), (w - 40, y)], fill=(170, 205, 180, 255), width=5)
        for x in range(40, w - 20, 107):
            d.line([(x, 190), (x, 450)], fill=(170, 205, 180, 255), width=5)
        d.rectangle([150, 245, 253, 293], fill=(33, 115, 70, 255))
    else:
        d.rounded_rectangle([40, 200, w - 40, 420], radius=14, fill=(250, 226, 214, 255))
        d.pieslice([90, 240, 230, 380], 0, 260, fill=(196, 62, 28, 255))
        for y in (260, 310, 360):
            d.rounded_rectangle([250, y, 330, y + 18], radius=8, fill=(225, 150, 120, 255))
    d.rounded_rectangle([-6, 40, 190, 170], radius=22, fill=color + (255,))
    d.text((92, 104), letter, font=font(104), fill=(255, 255, 255, 255), anchor="mm")
    return im


def place(img, layer, pos, blur=18, alpha=120):
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    a = layer.split()[3].point(lambda v: alpha if v > 0 else 0)
    blk = Image.new("RGBA", layer.size, (0, 0, 0, 255))
    blk.putalpha(a)
    sh.alpha_composite(blk, (pos[0] + 12, pos[1] + 20))
    img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(blur)))
    img.alpha_composite(layer, pos)
    return img


def main():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp((15, 60, 110), (14, 150, 120), y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=255)
    img.paste(grad, (0, 0), mask)
    gloss = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse([-200, -520, S + 200, 420], fill=(255, 255, 255, 34))
    img = Image.alpha_composite(img, Image.composite(gloss, Image.new("RGBA", (S, S)), mask))

    # 三張文件扇形排開（簡報在最後、文書在最前）
    for color, letter, kind, ang, pos in (((196, 62, 28), "P", "slide", -16, (470, 300)),
                                          ((33, 115, 70), "X", "cell", 0, (318, 270)),
                                          ((43, 87, 154), "W", "word", 15, (130, 300))):
        img = place(img, sheet(color, letter, kind).rotate(ang, expand=True, resample=Image.BICUBIC), pos)

    # 右下流程圖小卡
    card = Image.new("RGBA", (250, 210), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, 249, 209], radius=34, fill=(122, 79, 181, 255), outline=(255, 255, 255, 255), width=10)
    cd.rounded_rectangle([88, 30, 162, 74], radius=10, fill=(255, 255, 255, 255))
    cd.line([(125, 74), (125, 104), (60, 104), (60, 130)], fill=(255, 255, 255, 255), width=8)
    cd.line([(125, 104), (190, 104), (190, 130)], fill=(255, 255, 255, 255), width=8)
    cd.ellipse([30, 130, 92, 180], fill=(255, 255, 255, 255))
    cd.polygon([(190, 128), (224, 155), (190, 182), (156, 155)], fill=(255, 255, 255, 255))
    img = place(img, card, (700, 700), blur=14, alpha=110)

    # 標題列「文件office」
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([150, 92, 874, 232], radius=50, fill=(30, 77, 140, 255), outline=(120, 170, 230, 255), width=6)
    d.text((512, 160), "文件office", font=font(92), fill=(255, 255, 255, 255), anchor="mm")
    # 左下「資料助秘」
    d.rounded_rectangle([96, 850, 470, 940], radius=34, fill=(255, 255, 255, 235))
    d.text((283, 893), "資料助秘", font=font(56), fill=(15, 74, 117, 255), anchor="mm")

    out = os.path.join(HERE, "web", "assets")
    os.makedirs(out, exist_ok=True)
    img.save(os.path.join(out, "icon.png"))
    for n in (256, 192, 180, 512):
        img.resize((n, n), Image.LANCZOS).save(os.path.join(out, "icon-%d.png" % n))
    os.makedirs(os.path.join(HERE, "packaging"), exist_ok=True)
    img.save(os.path.join(HERE, "packaging", "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("ok")


if __name__ == "__main__":
    main()
