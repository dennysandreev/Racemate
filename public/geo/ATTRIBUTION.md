# Season globe geography source

- Dataset: Natural Earth, Admin 0 - Countries
- Version: 5.1.2
- Scale: 1:110m
- Retrieved: 2026-08-26
- Worldview: Natural Earth default Admin 0 country boundaries
- Source: https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_admin_0_countries.geojson
- Terms: Natural Earth data is in the public domain: https://www.naturalearthdata.com/about/terms-of-use/
- Source GeoJSON SHA-256: `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`
- Runtime mask SHA-256: `43ea8edb1c1c16cd8403cd9259e3d11d18bf18359a8db1dd3acdedd6e7fd1359`

The source polygons are projected to a 2048x1024 equirectangular texture by
`scripts/generate-season-globe-mask.mjs`. Red stores land coverage, green stores
country boundaries, blue stores countries hosting a Grand Prix in the active
2026 calendar, and black stores ocean. The runtime shader maps those channels to
RaceSide semantic theme tokens; the host-country tint is a calendar highlight,
not a political category. Monaco and Singapore remain represented by their race
markers because their silhouettes are not present at the 1:110m dataset scale.
