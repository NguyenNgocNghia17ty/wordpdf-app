# Them quyen camera/luu file + icon rieng cho app (chay sau "npx cap add android")
import glob, os
from PIL import Image, ImageDraw, ImageFont

p = 'android/app/src/main/AndroidManifest.xml'
s = open(p, encoding='utf-8').read()
if 'android.permission.CAMERA' not in s:
    s = s.replace('<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.INTERNET" />\n'
        '    <uses-permission android:name="android.permission.CAMERA" />\n'
        '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n'
        '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="29" />\n'
        '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />')
    s = s.replace('<application', '<application\n        android:requestLegacyExternalStorage="true"', 1)
    open(p, 'w', encoding='utf-8').write(s)

font = None
for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
    if os.path.exists(f):
        font = f
        break

def grad(sz):
    im = Image.new('RGB', (sz, sz))
    px = im.load()
    a, b = (79, 70, 229), (124, 58, 237)
    for y in range(sz):
        for x in range(sz):
            t = (x + y) / (2 * sz)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return im

def letter(im, scale):
    d = ImageDraw.Draw(im)
    sz = im.width
    f = ImageFont.truetype(font, int(sz * scale)) if font else ImageFont.load_default(int(sz * scale))
    bb = d.textbbox((0, 0), "W", font=f)
    d.text(((sz - (bb[2] - bb[0])) / 2 - bb[0], (sz - (bb[3] - bb[1])) / 2 - bb[1]), "W", font=f, fill="white")

for path in glob.glob('android/app/src/main/res/mipmap-*/*.png'):
    sz = Image.open(path).size[0]
    n = os.path.basename(path)
    if 'foreground' in n:
        im = Image.new('RGBA', (sz, sz), (0, 0, 0, 0))
        letter(im, 0.30)
    else:
        im = grad(sz).convert('RGBA')
        letter(im, 0.55)
        m = Image.new('L', (sz, sz), 0)
        md = ImageDraw.Draw(m)
        if 'round' in n:
            md.ellipse((0, 0, sz - 1, sz - 1), fill=255)
        else:
            md.rounded_rectangle((0, 0, sz - 1, sz - 1), radius=sz // 5, fill=255)
        im.putalpha(m)
    im.save(path)

bg = 'android/app/src/main/res/values/ic_launcher_background.xml'
if os.path.exists(bg):
    open(bg, 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#5B45E0</color>\n</resources>\n')
print("patched")
