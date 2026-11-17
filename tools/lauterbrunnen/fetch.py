"""Download the raw data for chapter 4 (Lauterbrunnen) into a folder given on the command line.

    python3 -I tools/lauterbrunnen/fetch.py <raw-folder>

* OpenStreetMap data for the village and valley floor (roads, paths, buildings, rivers,
  waterfalls, woods, railway, cable car) and the named peaks around it, from the Overpass API.
  © OpenStreetMap contributors, ODbL.
* Elevation: Terrarium-encoded terrain tiles from the public AWS Open Data bucket
  (elevation-tiles-prod, Mapzen/Tilezen; sources include SRTM and others). Detailed tiles
  (zoom 13) for the valley, zoom 12 for the mountains around it (zoom 11 as a fallback).

Nothing here runs in the game: bake.py turns these files into public/lauterbrunnen.json.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

UA = 'PaletteRider-build/1.0 (one-off map data download for a hobby game)'
OUT = sys.argv[1]
os.makedirs(os.path.join(OUT, 'tiles'), exist_ok=True)

# the ride: Lauterbrunnen village and the valley floor south past the Staubbach falls
NEAR = dict(s=46.578, w=7.893, n=46.606, e=7.927)
# the view: from the Schynige Platte down to the Jungfrau, Breithorn and Mürren
FAR = dict(s=46.50, w=7.80, n=46.66, e=8.04)


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def overpass():
    b = f"{NEAR['s']},{NEAR['w']},{NEAR['n']},{NEAR['e']}"
    fb = f"{FAR['s']},{FAR['w']},{FAR['n']},{FAR['e']}"
    q = f"""[out:json][timeout:120];
(
  way["highway"]({b});
  way["building"]({b});
  way["waterway"]({b});
  way["natural"~"water|wood|scree|bare_rock|cliff"]({b});
  way["landuse"~"forest|meadow|grass|farmland|residential"]({b});
  way["railway"]({b});
  way["aerialway"]({b});
  way["leisure"~"park|pitch|camp_site"]({b});
  way["tourism"~"camp_site|caravan_site"]({b});
  node["natural"="waterfall"]({b});
  way["natural"="waterfall"]({b});
  node["place"]({b});
  node["amenity"~"place_of_worship|restaurant|cafe"]({b});
  way["amenity"="place_of_worship"]({b});
  node["natural"="peak"]["name"]({fb});
  node["natural"="glacier"]({fb});
  way["natural"="glacier"]({fb});
);
out body;
>;
out skel qt;"""
    data = urllib.parse.urlencode({'data': q}).encode()
    raw = get('https://overpass-api.de/api/interpreter', data)
    with open(os.path.join(OUT, 'osm.json'), 'wb') as f:
        f.write(raw)
    print('osm.json', len(raw), 'bytes')


def tile_range(box, z):
    def tx(lon):
        return int((lon + 180) / 360 * 2 ** z)

    def ty(lat):
        r = math.radians(lat)
        return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z)
    return range(tx(box['w']), tx(box['e']) + 1), range(ty(box['n']), ty(box['s']) + 1)


def tiles():
    n = 0
    for box, z in ((NEAR, 13), (FAR, 12), (FAR, 11)):
        xs, ys = tile_range(box, z)
        for x in xs:
            for y in ys:
                path = os.path.join(OUT, 'tiles', f'{z}_{x}_{y}.png')
                if os.path.exists(path):
                    continue
                png = get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png')
                with open(path, 'wb') as f:
                    f.write(png)
                n += 1
                time.sleep(0.1)
    print('tiles downloaded:', n)


overpass()
tiles()
