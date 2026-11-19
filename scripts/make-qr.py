import qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image, ImageDraw, ImageFont

URL = "https://al1c0ach.github.io/zhejiang-civil-exam/"

qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M, box_size=12, border=3)
qr.add_data(URL)
qr.make(fit=True)
img = qr.make_image(fill_color="#12233d", back_color="white").convert("RGB")

w, h = img.size
canvas = Image.new("RGB", (w, h + 104), "white")
canvas.paste(img, (0, 0))
draw = ImageDraw.Draw(canvas)

try:
    title = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 32)
    sub = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
except Exception:
    title = sub = ImageFont.load_default()

draw.text((w / 2, h + 18), "扫码开始刷题", fill="#12233d", font=title, anchor="ma")
draw.text((w / 2, h + 62), "浙江省公务员 · 事业单位", fill="#6b7280", font=sub, anchor="ma")

canvas.save("手机扫码访问.png")
print(canvas.size, URL)
