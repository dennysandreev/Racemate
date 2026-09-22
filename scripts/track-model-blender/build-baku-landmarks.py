"""Photo-referenced Baku hotels on their mapped footprints, in real metres.

Facade colours, glazing and crowns follow the reference photographs listed in
docs/track-model-baku-hotels.json. Heights and small dimensions are estimates,
not a claim of surveyed LoD2 geometry. Geometry shares the city's material.
"""
import math


HOTELS = {
    152192792: {"name": "Hilton Baku", "floors": 25, "height": 105.5},
    153128834: {"name": "JW Marriott Absheron Baku", "floors": 23, "height": 82.8},
}


def colour(rgb):
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)


STONE = colour((.78, .76, .69))
FRAME = colour((.34, .39, .40))
DARK = colour((.10, .18, .22))


def build_hotel(mesh, base, element, polygon, center, ground):
    hotel = HOTELS[element["id"]]
    hilton = element["id"] == 152192792
    ring = [base.local_xy(p, center) for p in polygon[:-1]]
    cx = sum(p[0] for p in ring) / len(ring)
    cy = sum(p[1] for p in ring) / len(ring)
    # Both hotel axes follow Azadlig Avenue; the long axis is NNW/SSE.
    axis = (-.36, math.sqrt(1 - .36 ** 2))
    cross = (axis[1], -axis[0])
    def along(p): return (p[0] - cx) * axis[0] + (p[1] - cy) * axis[1]
    def point(u, v): return (cx + u * axis[0] + v * cross[0], cy + u * axis[1] + v * cross[1])
    def prism(points, bottom, top, tint=STONE):
        # These points are already local; keep the shared helper's transform neutral.
        return base.add_polygon_prism(mesh, [points], {"x": 0, "y": 0}, bottom, top,
                                      roof_color=tint, wall_color=tint)
    def wall(a, b, bottom, top, tint):
        mesh.add_quad(((*a, bottom), (*b, bottom), (*b, top), (*a, top)), color=tint)
    signed_area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))
    outward = 1 if signed_area > 0 else -1
    body_top = ground + (97.5 if hilton else 81.5)
    base_top = ground + (14 if hilton else 9)
    prism(ring, ground, body_top)
    rows = 20 if hilton else 19
    glass_top = ground + (92 if hilton else 77.7)
    row_height = (glass_top - base_top) / rows
    glass = (.19, .36, .47) if hilton else (.39, .50, .54)
    glazing_panels = 0
    balcony_edges = 0
    for edge, (a, b) in enumerate(zip(ring, ring[1:] + ring[:1])):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        normal = (outward * dy / length, -outward * dx / length)
        def at(t, offset=.045):
            return (a[0] + dx * t + normal[0] * offset, a[1] + dy * t + normal[1] * offset)
        columns = max(1, round(length / 2.2))
        on_wing = hilton or abs((along(a) + along(b)) / 2) > 19
        # Floor bands and mullions divide one continuous glass face into bays.
        # Avoid thousands of redundant per-storey vertices in the delivery asset.
        variation = .012 * (edge % 4)
        tint = colour(tuple(c + variation for c in glass))
        wall(at(0), at(1), base_top, glass_top, tint)
        glazing_panels += columns * rows
        for row in range(rows):
            bottom = base_top + row * row_height
            top = bottom + row_height - (.42 if on_wing else .10)
            if on_wing:
                offset = .14 if hilton else .65
                wall(at(0, offset), at(1, offset), top, bottom + row_height, STONE)
                if not hilton:
                    mesh.add_quad(((*at(0), top), (*at(1), top), (*at(1, offset), top), (*at(0, offset), top)), color=STONE)
                balcony_edges += 1
            else:
                wall(at(0, .06), at(1, .06), top, bottom + row_height, FRAME)
        # Continuous slender mullions. The glass remains opaque to avoid sorting artefacts.
        for column in range(1, columns):
            t = column / columns
            half = .055 / length
            wall(at(t - half, .075), at(t + half, .075), base_top, glass_top, FRAME)
        # Hilton's lower stone podium and upper attic use discrete window bays.
        for bottom, top, width_ratio in ((ground + 1.4, base_top - .7, .66),
                                        (glass_top + .8, body_top - 1.1, .63)):
            tiers = 3 if hilton and bottom < base_top else 1
            for level in range(tiers):
                z = bottom + (top - bottom) * level / tiers
                h = (top - bottom) / tiers * .75
                for column in range(columns):
                    inset = (1 - width_ratio) / 2
                    wall(at((column + inset) / columns), at((column + 1 - inset) / columns), z, z + h, DARK)
        # A thin projecting roof fascia gives the tower a readable silhouette.
        wall(at(0, .38), at(1, .38), body_top - .45, body_top, STONE)

    if hilton:
        # The distinctive blue cylindrical core rises above both rectangular wings.
        centre = point(5.5, 10)
        radius = 8.2
        cylinder = [(centre[0] + radius * math.cos(i * math.tau / 32),
                     centre[1] + radius * math.sin(i * math.tau / 32)) for i in range(32)]
        prism(cylinder, ground, base_top)
        prism(cylinder, base_top, ground + hotel["height"], colour((.17, .34, .45)))
        for i, (a, b) in enumerate(zip(cylinder, cylinder[1:] + cylinder[:1])):
            angle = i * math.tau / 32
            p = (centre[0] + (radius + .025) * math.cos(angle), centre[1] + (radius + .025) * math.sin(angle))
            q = (p[0] - .10 * math.sin(angle), p[1] + .10 * math.cos(angle))
            wall(p, q, base_top, ground + hotel["height"] - .5, FRAME)
        prism(cylinder, ground + hotel["height"] - .35, ground + hotel["height"], colour((.48, .54, .56)))
    else:
        # Projecting rounded roof plates over the two balcony stacks; the middle
        # stays recessed, matching the open roof pergola in the reference.
        for indices in (range(2, 23), range(24, 47)):
            cap = [ring[i] for i in indices]
            cc = (sum(p[0] for p in cap) / len(cap), sum(p[1] for p in cap) / len(cap))
            cap = [(cc[0] + (p[0] - cc[0]) * 1.025, cc[1] + (p[1] - cc[1]) * 1.025) for p in cap]
            prism(cap, body_top, ground + hotel["height"])
        for u in range(-17, 20, 3):
            a, b = point(u, -22), point(u, 23)
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ground + hotel["height"] - .3)
            mesh.add_box(mid, (math.dist(a, b), .24, .24), color=STONE,
                         rotation=math.atan2(b[1] - a[1], b[0] - a[0]))
        # Narrow stone piers frame the central glazed curtain wall.
        for u in (-19, 19):
            for v in (-24, 24):
                p = point(u, v)
                mesh.add_box((*p, (base_top + body_top) / 2), (1.05, 1.05, body_top - base_top), color=STONE)
    return {"osmWayId": element["id"], **hotel, "glazingPanels": glazing_panels,
            "floorBandSegments": balcony_edges, "footprintSource": "OpenStreetMap",
            "heightAccuracy": "Approximate architectural height; storey counts checked against operator/official sources",
            "facadeAccuracy": "Photo-referenced opaque glazing, stone bands, mullions and roof geometry; not a photogrammetric survey"}
