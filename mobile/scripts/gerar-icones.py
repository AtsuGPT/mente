"""
Gera os ícones do app a partir do símbolo Convergência (a mesma geometria do componente
src/components/convergence-symbol.tsx e da peça de identidade): dois arcos orbitais, o de Kayk
(violeta, com 8 pontos; o 8º é a emenda) e o de Julia (fios finos, cobre nas pontas), e a luz
onde eles se cruzam.

Uso (na pasta mobile/):  python scripts/gerar-icones.py
Saída em assets/: icon.png, android-icon-*.png, splash-icon.png e favicon.png.
Precisa de Pillow e numpy.
"""

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")

C = 500.0
K = (360.0, 128.0, math.radians(-14))
J = (150.0, 352.0, math.radians(-28))
KAYK = [(0, "#6B45DE"), (0.3, "#A58BF7"), (0.52, "#E7DEFF"), (0.74, "#9A78F3"), (1, "#5A33CC")]
JULIA = [(0, "#F7CBA8"), (0.16, "#E99A7E"), (0.36, "#C98BC8"), (0.5, "#9E74EA"), (0.64, "#C98BC8"), (0.84, "#E99A7E"), (1, "#F7CBA8")]
TILE = [(0, "#06030B"), (0.58, "#0C0618"), (0.86, "#24105A"), (1, "#3D1A92")]


def rgb(hexa):
    h = hexa.lstrip("#")
    return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def ramp(stops, u):
    u = min(1.0, max(0.0, u))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if u <= b:
            f = 0 if b == a else (u - a) / (b - a)
            return rgb(ca) * (1 - f) + rgb(cb) * f
    return rgb(stops[-1][1])


def pt(E, t, d=0.0):
    rx, ry, rot = E
    x = (rx + d) * math.cos(t)
    y = (ry + d) * math.sin(t)
    return (C + x * math.cos(rot) - y * math.sin(rot), C + x * math.sin(rot) + y * math.cos(rot))


def arc(E, t0, t1, n=240, dfn=None):
    return [pt(E, t0 + (t1 - t0) * i / n, dfn(t0 + (t1 - t0) * i / n) if dfn else 0.0) for i in range(n + 1)]


def kayk_u(p):
    return (p[0] - 140) / 720


def julia_u(p):
    # Degradê ao longo do eixo inclinado do arco (pontas em cobre, meio em lavanda).
    x0, y0, w, h = 190.0, 140.0, 620.0, 720.0
    vx, vy = (p[0] - x0) / w - 0.22, (p[1] - y0) / h
    return (vx * 0.56 + vy * 1.0) / (0.56 * 0.56 + 1.0)


class Board:
    """Acumula luz (soma) numa imagem grande; reduz no fim (anti-serrilhado)."""

    def __init__(self, px):
        self.px = px
        self.s = px / 1000.0
        self.acc = np.zeros((px, px, 3), dtype=np.float32)

    def stroke(self, points, width, color_of, opacity=1.0, blur=0.0, weight_of=None):
        """Um traço numa camada só: as metades da frente e de trás de um arco (weight_of dá a
        opacidade de cada trecho) não se somam nas pontas, que pareceriam pontos a mais."""
        layer = Image.new("RGB", (self.px, self.px), (0, 0, 0))
        draw = ImageDraw.Draw(layer)
        w = max(1, int(round(width * self.s)))
        r = w / 2
        for i, (a, b) in enumerate(zip(points, points[1:])):
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            k = weight_of(i / max(1, len(points) - 2)) if weight_of else 1.0
            c = tuple(int(v * 255 * k) for v in color_of(mid))
            pa = (a[0] * self.s, a[1] * self.s)
            pb = (b[0] * self.s, b[1] * self.s)
            draw.line([pa, pb], fill=c, width=w)
            draw.ellipse([pb[0] - r, pb[1] - r, pb[0] + r, pb[1] + r], fill=c)
        self.add(layer, opacity, blur)

    def dots(self, centers, radius, color, opacity=1.0, blur=0.0):
        layer = Image.new("RGB", (self.px, self.px), (0, 0, 0))
        draw = ImageDraw.Draw(layer)
        c = tuple(int(v * 255) for v in rgb(color))
        for x, y in centers:
            r = radius * self.s
            draw.ellipse([x * self.s - r, y * self.s - r, x * self.s + r, y * self.s + r], fill=c)
        self.add(layer, opacity, blur)

    def add(self, layer, opacity, blur):
        if blur:
            layer = layer.filter(ImageFilter.GaussianBlur(blur * self.s))
        self.acc += np.asarray(layer, dtype=np.float32) / 255.0 * opacity

    def flare(self, x, y, radius, strength):
        stops = [(0, (1.0, 1.0, 1.0), 0.95), (0.18, tuple(rgb("#F1E6FF")), 0.75), (0.5, tuple(rgb("#B58CF5")), 0.22), (1, (0.52, 0.38, 0.94), 0.0)]
        r = radius * self.s
        x0, x1 = int(max(0, x * self.s - r)), int(min(self.px, x * self.s + r + 1))
        y0, y1 = int(max(0, y * self.s - r)), int(min(self.px, y * self.s + r + 1))
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        d = np.sqrt((xx - x * self.s) ** 2 + (yy - y * self.s) ** 2) / r
        out = np.zeros((y1 - y0, x1 - x0, 3), dtype=np.float32)
        for (a, ca, oa), (b, cb, ob) in zip(stops, stops[1:]):
            m = (d >= a) & (d < b)
            f = ((d - a) / (b - a))[m][:, None]
            col = np.array(ca) * (1 - f) + np.array(cb) * f
            op = (oa * (1 - f) + ob * f)
            out[m] = col * op
        self.acc[y0:y1, x0:x1] += out * strength

    def darken(self, x, y, w, h, angle, amount):
        mask = Image.new("L", (self.px, self.px), 0)
        draw = ImageDraw.Draw(mask)
        ca, sa = math.cos(angle), math.sin(angle)
        corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
        draw.polygon([((x + cx * ca - cy * sa) * self.s, (y + cx * sa + cy * ca) * self.s) for cx, cy in corners], fill=255)
        m = np.asarray(mask, dtype=np.float32)[:, :, None] / 255.0
        self.acc *= 1 - m * amount

    def bar(self, x, y, w, h, angle, color, opacity=1.0, blur=0.0):
        layer = Image.new("RGB", (self.px, self.px), (0, 0, 0))
        draw = ImageDraw.Draw(layer)
        ca, sa = math.cos(angle), math.sin(angle)
        corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
        c = tuple(int(v * 255) for v in rgb(color))
        draw.polygon([((x + cx * ca - cy * sa) * self.s, (y + cx * sa + cy * ca) * self.s) for cx, cy in corners], fill=c)
        self.add(layer, opacity, blur)


def symbol(board, simple):
    pi = math.pi
    kc = lambda p: ramp(KAYK, kayk_u(p))
    jc = lambda p: ramp(JULIA, julia_u(p))
    # Cada arco é um laço inteiro, desenhado de uma vez; a metade de trás só fica mais apagada.
    # Kayk: frente embaixo (t de 0 a pi). Julia: frente à direita (t de -pi/2 a pi/2).
    loop_k = arc(K, 0, 2 * pi, 480)
    loop_j = arc(J, -pi / 2, 3 * pi / 2, 480)
    k_front = lambda f: f < 0.5
    j_front = lambda f: f < 0.5
    kw, jw = (22, 20) if simple else (14, 14)
    board.stroke(loop_k, 40, lambda p: rgb("#8461F0"), 1.0, blur=10, weight_of=lambda f: 0.26 if k_front(f) else 0.16)
    board.stroke(loop_j, 32, lambda p: rgb("#D99596"), 1.0, blur=10, weight_of=lambda f: 0.22 if j_front(f) else 0.14)
    if simple:
        board.stroke(loop_j, jw, jc, 1.0, weight_of=lambda f: 1.0 if j_front(f) else 0.45)
    else:
        board.stroke(loop_j, 14, jc, 1.0, weight_of=lambda f: 0.22 if j_front(f) else 0.12)
        offs = [-9, -3.2, 3.2, 9]
        for k, off in enumerate(offs):
            dfn = lambda t, off=off, k=k: off + 2.6 * math.sin(2 * t + k * 1.7)
            width = 2.8 if k in (0, 3) else 2.3
            board.stroke(arc(J, -pi / 2, 3 * pi / 2, 480, dfn), width, jc, 1.0, weight_of=lambda f: 1.0 if j_front(f) else 0.45)
        board.stroke(arc(J, -pi / 2 + 0.2, pi / 2 - 0.2, 200, lambda t: -11 + 2.6 * math.sin(2 * t)), 1.2, lambda p: rgb("#FFF1E4"), 0.55)
    board.stroke(loop_k, kw, kc, 1.0, weight_of=lambda f: 1.0 if k_front(f) else 0.42)
    if not simple:
        board.stroke(arc(K, 0.15, pi - 0.15, 200, lambda t: -4), 1.6, lambda p: rgb("#F6F1FF"), 0.6)
        t0 = 0.42
        front, back = [], []
        for k in range(1, 8):
            t = t0 + k * 2 * pi / 8
            (front if math.sin(t) > 0 else back).append(pt(K, t))
        board.dots(front, 4.2, "#F7F3FF", 0.9)
        board.dots(front, 4.2, "#C7B7FA", 0.5, blur=4)
        board.dots(back, 3.4, "#EDE5FF", 0.42)
    # Emenda (8º ponto): um traço fino interrompe o fio; duas faixas claras o unem.
    t0 = 0.42
    sx, sy = pt(K, t0)
    dx, dy = -K[0] * math.sin(t0), K[1] * math.cos(t0)
    tang = math.atan2(dx * math.sin(K[2]) + dy * math.cos(K[2]), dx * math.cos(K[2]) - dy * math.sin(K[2]))
    # Delicada: um corte fino na largura do arco e duas faixas claras, finas, que o costuram; luz morna em volta.
    sc = 1.6 if simple else 1.0
    band = kw * 1.15
    board.dots([(sx, sy)], 16 * sc, "#F2D7B8", 0.32, blur=6 * sc)
    board.darken(sx, sy, 1.6 * sc, kw + 1, tang, 0.55)
    for off in (-3.4, 3.4):
        board.bar(sx + off * sc * math.cos(tang), sy + off * sc * math.sin(tang), 1.5 * sc, band, tang, "#FFF4E8", 0.95)
    # Interseções: a luz acende onde os arcos se cruzam.
    prev = None
    for i in range(2881):
        t = 2 * pi * i / 2880
        x, y = pt(K, t)
        ddx, ddy = x - C, y - C
        c, s = math.cos(J[2]), math.sin(J[2])
        lx, ly = ddx * c + ddy * s, -ddx * s + ddy * c
        f = (lx / J[0]) ** 2 + (ly / J[1]) ** 2 - 1
        if prev is not None and (prev < 0) != (f < 0):
            front = (1 if math.sin(t) > 0 else 0) + (1 if lx > 0 else 0)
            board.flare(x, y, (44 if simple else 34) + 9 * front, 0.45 + 0.275 * front)
        prev = f


def background(px, tile_radius=None):
    yy, xx = np.mgrid[0:px, 0:px].astype(np.float32) / px
    d = np.sqrt((xx - 0.5) ** 2 + (yy - 0.46) ** 2) / 0.72
    out = np.zeros((px, px, 3), dtype=np.float32)
    for (a, ca), (b, cb) in zip(TILE, TILE[1:]):
        m = (d >= a) & (d < b)
        f = ((d - a) / (b - a))[m][:, None]
        out[m] = rgb(ca) * (1 - f) + rgb(cb) * f
    out[d >= 1] = rgb(TILE[-1][1])
    alpha = np.ones((px, px), dtype=np.float32)
    if tile_radius is not None:
        mask = Image.new("L", (px, px), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0.036 * px, 0.036 * px, 0.964 * px, 0.964 * px], radius=tile_radius * px, fill=255)
        alpha = np.asarray(mask, dtype=np.float32) / 255.0
    return out, alpha


def render(px, simple=False, scale=1.0, bg=None, tile=False, opaque=False, mono=False, out=None):
    big = px * 4
    board = Board(big)
    symbol(board, simple)
    light = board.acc
    if scale != 1.0:
        img = Image.fromarray((np.clip(light, 0, 1) * 255).astype(np.uint8))
        size = int(big * scale)
        small = img.resize((size, size), Image.LANCZOS)
        canvas = Image.new("RGB", (big, big), (0, 0, 0))
        canvas.paste(small, ((big - size) // 2, (big - size) // 2))
        light = np.asarray(canvas, dtype=np.float32) / 255.0
    if mono:
        a = np.clip(light.max(axis=2) * 1.6, 0, 1)
        rgba = np.dstack([np.ones_like(a), np.ones_like(a), np.ones_like(a), a])
    elif bg is not None:
        base, alpha = background(big, 0.214 if tile else None)
        color = np.clip(base + light, 0, 1)
        rgba = np.dstack([color, alpha if (tile and not opaque) else np.ones_like(alpha)])
    else:
        a = np.clip(light.max(axis=2), 0, 1)
        color = np.where(a[:, :, None] > 0, np.clip(light / np.maximum(a[:, :, None], 1e-6), 0, 1), 0)
        rgba = np.dstack([color, a])
    img = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA").resize((px, px), Image.LANCZOS)
    if opaque:
        img = img.convert("RGB")
    img.save(os.path.join(ASSETS, out), optimize=True)
    print("gerado", out, img.size)


def background_only(px, out):
    base, _ = background(px * 2)
    img = Image.fromarray((base * 255).astype(np.uint8), "RGB").resize((px, px), Image.LANCZOS)
    img.save(os.path.join(ASSETS, out), optimize=True)
    print("gerado", out, img.size)


if __name__ == "__main__":
    render(1024, bg=True, opaque=True, out="icon.png")
    render(512, scale=0.84, out="android-icon-foreground.png")
    background_only(512, "android-icon-background.png")
    render(432, simple=True, scale=0.84, mono=True, out="android-icon-monochrome.png")
    render(1024, out="splash-icon.png")
    render(48, simple=True, bg=True, tile=True, out="favicon.png")
