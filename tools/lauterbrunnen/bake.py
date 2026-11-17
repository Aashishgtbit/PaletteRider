"""Bake the raw Lauterbrunnen downloads into public/lauterbrunnen.json for chapter 4.

    python3 -I tools/lauterbrunnen/bake.py <raw-folder> public/lauterbrunnen.json

The real place is scaled down by S (one game unit = 1/S metres) so the valley fits a ride;
heights use the same scale, so the cliffs and the Jungfrau keep their real proportions.
Chalets and roads are drawn larger than life (see BLDG) so they read at bicycle size.
"""
import base64
import json
import math
import os
import struct
import sys

from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
S = 0.2            # game units per metre
LAT0, LON0 = 46.5935, 7.9080   # the middle of the village, between the church and the Staubbach
BASE = 797.0       # the valley floor at the village (m): game height 0
NEAR = dict(s=46.578, w=7.893, n=46.606, e=7.927)
FAR = dict(s=46.50, w=7.80, n=46.66, e=8.04)
M_LAT = 111132.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
BLDG = 1.5         # chalets drawn this much bigger than life


def px(lat, lon):  # metres east, metres south of the origin
    return (lon - LON0) * M_LON, (LAT0 - lat) * M_LAT


# ---------- elevation from the Terrarium tiles ----------
tiles = {}
for f in os.listdir(os.path.join(RAW, 'tiles')):
    z, x, y = map(int, f[:-4].split('_'))
    im = Image.open(os.path.join(RAW, 'tiles', f)).convert('RGB')
    tiles[(z, x, y)] = (im.load(), im.size[0])


def elev_at(lat, lon, z):
    n = 2 ** z
    gx = (lon + 180) / 360 * n
    r = math.radians(lat)
    gy = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n
    def raw(ix, iy):
        tx, ty = ix // 256, iy // 256
        t = tiles.get((z, tx, ty))
        if not t:
            return None
        p, size = t
        R, G, B = p[ix % 256 * size // 256, iy % 256 * size // 256]
        return R * 256 + G + B / 256 - 32768
    fx, fy = gx * 256 - 0.5, gy * 256 - 0.5
    ix, iy = math.floor(fx), math.floor(fy)
    ax, ay = fx - ix, fy - iy
    v = [raw(ix, iy), raw(ix + 1, iy), raw(ix, iy + 1), raw(ix + 1, iy + 1)]
    if any(q is None for q in v):
        return None
    return (v[0] * (1 - ax) + v[1] * ax) * (1 - ay) + (v[2] * (1 - ax) + v[3] * ax) * ay


def grid(box, step_m, z, smooth):
    x0, z0 = px(box['n'], box['w'])
    x1, z1 = px(box['s'], box['e'])
    nx, nz = int((x1 - x0) / step_m) + 1, int((z1 - z0) / step_m) + 1
    h = [[0.0] * nx for _ in range(nz)]
    for j in range(nz):
        for i in range(nx):
            xm, zm = x0 + i * step_m, z0 + j * step_m
            lat, lon = LAT0 - zm / M_LAT, LON0 + xm / M_LON
            e = elev_at(lat, lon, z)
            if e is None:
                e = elev_at(lat, lon, 11) or BASE
            h[j][i] = e
    for _ in range(smooth):  # soften the tile noise
        g = [row[:] for row in h]
        for j in range(nz):
            for i in range(nx):
                s = c = 0.0
                for dj in (-1, 0, 1):
                    for di in (-1, 0, 1):
                        jj, ii = j + dj, i + di
                        if 0 <= jj < nz and 0 <= ii < nx:
                            w = 2.0 if (di == 0 and dj == 0) else 1.0
                            s += g[jj][ii] * w; c += w
                h[j][i] = s / c
    return dict(x0=x0, z0=z0, nx=nx, nz=nz, step=step_m, h=h)


near = grid(NEAR, 10.0, 13, 2)
far = grid(FAR, 60.0, 12, 0)  # sharp enough that the Jungfrau, Mönch and Eiger keep their shapes
print('near grid', near['nx'], 'x', near['nz'], ' far grid', far['nx'], 'x', far['nz'])


def near_h(xm, zm):
    i = (xm - near['x0']) / near['step']; j = (zm - near['z0']) / near['step']
    i = min(max(i, 0), near['nx'] - 1.001); j = min(max(j, 0), near['nz'] - 1.001)
    i0, j0 = int(i), int(j); a, b = i - i0, j - j0
    H = near['h']
    return (H[j0][i0] * (1 - a) + H[j0][i0 + 1] * a) * (1 - b) + (H[j0 + 1][i0] * (1 - a) + H[j0 + 1][i0 + 1] * a) * b


# ---------- OpenStreetMap ----------
osm = json.load(open(os.path.join(RAW, 'osm.json')))
nodes = {e['id']: e for e in osm['elements'] if e['type'] == 'node'}
ways = [e for e in osm['elements'] if e['type'] == 'way']


def line_of(w):
    return [px(nodes[n]['lat'], nodes[n]['lon']) for n in w['nodes'] if n in nodes]


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    (ax, az), (bx, bz) = pts[0], pts[-1]
    dx, dz = bx - ax, bz - az
    L = math.hypot(dx, dz) or 1e-9
    best, bi = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs((pts[k][0] - ax) * dz - (pts[k][1] - az) * dx) / L
        if d > best:
            best, bi = d, k
    if best > tol:
        return simplify(pts[:bi + 1], tol)[:-1] + simplify(pts[bi:], tol)
    return [pts[0], pts[-1]]


def flat(pts):  # metres -> game units, rounded
    out = []
    for x, z in pts:
        out += [round(x * S, 2), round(z * S, 2)]
    return out


ROAD = {  # class -> drawn width in game units, and how it is painted
    'secondary': (5.0, 'road'), 'tertiary': (4.6, 'road'), 'unclassified': (4.0, 'road'), 'residential': (3.8, 'road'),
    'service': (3.0, 'road'), 'living_street': (3.4, 'road'), 'pedestrian': (3.4, 'path'), 'track': (2.6, 'track'),
    'path': (1.8, 'path'), 'footway': (1.8, 'path'), 'bridleway': (2.0, 'track'), 'cycleway': (2.2, 'path'), 'steps': (1.6, 'path'),
}
roads, rails, cables, river, streams, woods, meadows, buildings, raw_buildings = [], [], [], [], [], [], [], [], []
church = None
for w in ways:
    t = w.get('tags', {})
    pts = line_of(w)
    if len(pts) < 2:
        continue
    if t.get('highway') in ROAD and t.get('area') != 'yes':
        width, kind = ROAD[t['highway']]
        roads.append(dict(k=kind, w=width, b=1 if t.get('bridge') else 0, t=1 if t.get('tunnel') else 0, p=flat(simplify(pts, 1.5))))
    elif t.get('railway') == 'narrow_gauge' and not t.get('tunnel'):
        rails.append(flat(simplify(pts, 1.5)))
    elif t.get('aerialway') in ('cable_car',):
        cables.append(dict(name=t.get('name', ''), p=flat(pts)))
    elif t.get('waterway') == 'river':
        river.append(flat(simplify(pts, 2.0)))
    elif t.get('waterway') == 'stream' and not t.get('tunnel'):
        streams.append(dict(name=t.get('name', ''), pts=pts))
    elif t.get('natural') == 'wood' or t.get('landuse') == 'forest':
        woods.append(flat(simplify(pts, 4.0)))
    elif t.get('landuse') in ('meadow', 'grass') or t.get('leisure') in ('park', 'pitch'):
        meadows.append(flat(simplify(pts, 4.0)))
    if 'building' in t and len(pts) >= 3:
        # the smallest rectangle round the outline: a chalet body with a gable roof along its length
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        best = None
        for k in range(len(pts) - 1):
            ang = math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0])
            ca, sa = math.cos(ang), math.sin(ang)
            us = [(p[0] - cx) * ca + (p[1] - cz) * sa for p in pts]
            vs = [-(p[0] - cx) * sa + (p[1] - cz) * ca for p in pts]
            area = (max(us) - min(us)) * (max(vs) - min(vs))
            if best is None or area < best[0]:
                best = (area, ang, max(us) - min(us), max(vs) - min(vs), (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2)
        area, ang, L, Wd = best[0], best[1], best[2], best[3]
        ux, vx = best[4], best[5]
        cx, cz = cx + ux * math.cos(ang) - vx * math.sin(ang), cz + ux * math.sin(ang) + vx * math.cos(ang)
        if area < 12:
            continue
        b = t.get('building')
        kind = 'church' if (b in ('church', 'chapel') or t.get('amenity') == 'place_of_worship') else \
            'barn' if b in ('barn', 'shed', 'farm_auxiliary', 'stable', 'garage', 'hut') else \
            'hotel' if (b in ('hotel', 'apartments', 'commercial') or area > 380) else 'house'
        levels = float(t.get('building:levels', 0) or 0) or {'church': 2.5, 'barn': 1.4, 'hotel': 4, 'house': 2.4}[kind]
        base = min(near_h(p[0], p[1]) for p in pts)
        raw_buildings.append(dict(cx=cx, cz=cz, L=L, W=Wd, ang=ang, base=base, h=levels * 3.0, kind=kind))
        if kind == 'church' and abs(cx) < 400 and abs(cz) < 400:
            church = dict(x=round(cx * S, 2), z=round(cz * S, 2), ang=round(ang, 3))
# Chalets are drawn larger than life so they read at bicycle size, but never so large that they
# cover a road or a path: each one grows only as far as the streets round it allow, and long
# or big buildings (the station, the hotels) keep their real size.
road_pts = {}
for r in roads:
    if r['t']:
        continue
    p = r['p']
    half = r['w'] / 2 / S  # metres
    for k in range(0, len(p) - 2, 2):
        ax, az, bx, bz = p[k] / S, p[k + 1] / S, p[k + 2] / S, p[k + 3] / S
        n = max(1, int(math.hypot(bx - ax, bz - az) / 2))
        for q in range(n + 1):
            x, z = ax + (bx - ax) * q / n, az + (bz - az) * q / n
            road_pts.setdefault((int(x // 20), int(z // 20)), []).append((x, z, half))
def clear_of_roads(b, scale):
    c, s_ = math.cos(b['ang']), math.sin(b['ang'])
    hl, hw = b['L'] * scale / 2, b['W'] * scale / 2
    r = math.hypot(hl, hw) + 15
    for gx in range(int((b['cx'] - r) // 20), int((b['cx'] + r) // 20) + 1):
        for gz in range(int((b['cz'] - r) // 20), int((b['cz'] + r) // 20) + 1):
            for x, z, half in road_pts.get((gx, gz), []):
                u = (x - b['cx']) * c + (z - b['cz']) * s_
                v = -(x - b['cx']) * s_ + (z - b['cz']) * c
                if abs(u) < hl + half * 0.8 and abs(v) < hw + half * 0.8:
                    return False
    return True
grown = 0
for b in raw_buildings:
    scale = 1.0
    if b['L'] * b['W'] < 300 and b['L'] < 30:
        for sc in (BLDG, 1.3, 1.15):
            if clear_of_roads(b, sc):
                scale = sc
                break
    grown += scale > 1
    buildings.append([round(b['cx'] * S, 2), round(b['cz'] * S, 2), round(b['L'] * S * scale, 2), round(b['W'] * S * scale, 2), round(b['ang'], 3),
                      round((b['base'] - BASE) * S, 2), round(b['h'] * S * max(scale, 1.3) * 0.8, 2), ['house', 'barn', 'hotel', 'church'].index(b['kind'])])
print('buildings drawn larger:', grown, 'of', len(raw_buildings))
print('roads', len(roads), 'rails', len(rails), 'buildings', len(buildings), 'woods', len(woods), 'meadows', len(meadows), 'church', church)

# ---------- waterfalls: wherever a stream drops steeply, sampled every 5 m along it ----------
falls = []
for s in streams:
    pts = s['pts']
    samp = []
    for k in range(len(pts) - 1):
        (ax, az), (bx, bz) = pts[k], pts[k + 1]
        L = math.hypot(bx - ax, bz - az)
        n = max(1, int(L / 5))
        for q in range(n):
            u = q / n
            x, z = ax + (bx - ax) * u, az + (bz - az) * u
            samp.append((x, z, near_h(x, z)))
    samp.append((pts[-1][0], pts[-1][1], near_h(*pts[-1])))
    k = 0
    while k < len(samp) - 1:
        if samp[k][2] - samp[k + 1][2] > 5 * 1.1:   # steeper than 48 degrees
            j = k
            while j < len(samp) - 1 and samp[j][2] - samp[j + 1][2] > 5 * 0.7:
                j += 1
            drop = samp[k][2] - samp[j][2]
            if drop > 40:
                falls.append(dict(name=s['name'], top=[round(samp[k][0] * S, 2), round(samp[k][1] * S, 2), round((samp[k][2] - BASE) * S, 2)],
                                  bottom=[round(samp[j][0] * S, 2), round(samp[j][1] * S, 2), round((samp[j][2] - BASE) * S, 2)], drop=round(drop)))
            k = j
        k += 1
print('falls', [(f['name'], f['drop']) for f in falls])

# ---------- where a bicycle can go ----------
nx, nz = near['nx'], near['nz']
H = near['h']
slope = [[0.0] * nx for _ in range(nz)]
for j in range(nz):
    for i in range(nx):
        gx = (H[j][min(i + 1, nx - 1)] - H[j][max(i - 1, 0)]) / (near['step'] * (min(i + 1, nx - 1) - max(i - 1, 0)))
        gz = (H[min(j + 1, nz - 1)][i] - H[max(j - 1, 0)][i]) / (near['step'] * (min(j + 1, nz - 1) - max(j - 1, 0)))
        slope[j][i] = math.hypot(gx, gz)


def raster(lines_m, radius_m):
    hit = [[False] * nx for _ in range(nz)]
    for pts in lines_m:
        for k in range(len(pts) - 1):
            (ax, az), (bx, bz) = pts[k], pts[k + 1]
            L = math.hypot(bx - ax, bz - az)
            n = max(1, int(L / (near['step'] / 2)))
            for q in range(n + 1):
                x, z = ax + (bx - ax) * q / n, az + (bz - az) * q / n
                ci, cj = (x - near['x0']) / near['step'], (z - near['z0']) / near['step']
                r = radius_m / near['step']
                for jj in range(int(cj - r), int(cj + r) + 2):
                    for ii in range(int(ci - r), int(ci + r) + 2):
                        if 0 <= jj < nz and 0 <= ii < nx and math.hypot(ii - ci, jj - cj) <= r + 0.5:
                            hit[jj][ii] = True
    return hit


road_m = [[(p[k] / S, p[k + 1] / S) for k in range(0, len(p), 2)] for p in (r['p'] for r in roads if not r['t'])]
river_m = [[(p[k] / S, p[k + 1] / S) for k in range(0, len(p), 2)] for p in river]
on_road = raster(road_m, 6.0)
in_river = raster(river_m, 7.0)
ok = [[(slope[j][i] < 0.42 or on_road[j][i]) and not (in_river[j][i] and not on_road[j][i]) for i in range(nx)] for j in range(nz)]
# keep only what joins up with the village
si, sj = int((0 - near['x0']) / near['step']), int((0 - near['z0']) / near['step'])
seen = [[False] * nx for _ in range(nz)]
stack = [(si, sj)]
while stack:
    i, j = stack.pop()
    if not (0 <= i < nx and 0 <= j < nz) or seen[j][i] or not ok[j][i]:
        continue
    seen[j][i] = True
    stack += [(i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)]
print('rideable cells', sum(map(sum, seen)), 'of', nx * nz)

# ---------- named peaks for the panorama ----------
peaks = []
for e in osm['elements']:
    t = e.get('tags', {})
    if e['type'] == 'node' and t.get('natural') == 'peak' and t.get('name') and t.get('ele'):
        try:
            ele = float(str(t['ele']).split()[0])
        except ValueError:
            continue
        x, z = px(e['lat'], e['lon'])
        peaks.append(dict(name=t['name'], x=round(x * S, 1), z=round(z * S, 1), y=round((ele - BASE) * S, 1), ele=round(ele)))
peaks.sort(key=lambda p: -p['ele'])


def b64_i16(rows, f):
    data = b''.join(struct.pack('<h', max(-32767, min(32767, int(round(f(v)))))) for row in rows for v in row)
    return base64.b64encode(data).decode()


def pack(g):
    return dict(x0=round(g['x0'] * S, 3), z0=round(g['z0'] * S, 3), nx=g['nx'], nz=g['nz'], step=round(g['step'] * S, 4),
                h=b64_i16(g['h'], lambda v: (v - BASE) * S * 20))


cab = next((c for c in cables if 'rren' in c['name']), cables[0] if cables else None)
out = dict(
    note='Built from OpenStreetMap data (c) OpenStreetMap contributors, ODbL, and Terrarium terrain tiles (AWS Open Data, Mapzen/Tilezen; SRTM and other sources).',
    origin=[LAT0, LON0], scale=S, base=BASE,
    near=pack(near), far=pack(far),
    ride=base64.b64encode(bytes(1 if seen[j][i] else 0 for j in range(nz) for i in range(nx))).decode(),
    roads=roads, rails=rails, cable=cab, river=river, woods=woods, meadows=meadows,
    streams=[flat(simplify(s['pts'], 2.0)) for s in streams],
    buildings=buildings, falls=falls, peaks=peaks[:60], church=church,
)
with open(OUT, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
