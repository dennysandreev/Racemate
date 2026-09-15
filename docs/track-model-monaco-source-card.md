# Circuit de Monaco — карточка источников Blender-модели

Дата фиксации: 13 августа 2026 года.

## Геопривязка

- CRS сцены: WGS 84 / UTM zone 32N, EPSG:32632.
- Bbox: `372640, 4843100, 373820, 4844620`.
- Масштаб: 1 Blender unit = 1 метр.
- Высоты: метры исходного Terrarium DEM; вертикальное усиление отсутствует.
- Старт/финиш: OSM node `4937755860`, `43.7350269, 7.4212652`, сверенный со схемой FIA 2026.
- Направление: от контрольной линии на север по Boulevard Albert Ier к Sainte Dévote.

## Авторитетные контрольные данные

- [FIA Monaco 2026, Circuit Map V3](https://www.fia.com/system/files/decision-document/2026_monaco_event_-_circuit_map_-_monaco_2026_v1.pdf): длина 3 337 м, 19 поворотов, сектора 1 051/1 419/867 м, speed trap за 190 м до T10.
- [FIA Monaco GP 2026, Document 7](https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf): актуальная схема трассы, режим обгона, fast lane и 11 командных гаражных зон.
- [Automobile Club de Monaco, Formula 1 2026](https://monaco-grandprix.com/en/edition/formula-1-grand-prix-de-monaco-2026/): актуальный набор трибун и зрительских зон.

## Геоданные

- OpenStreetMap, ODbL 1.0: circuit relation `148194`, старт/финиш, текущие городские дороги, пит-лейн и выезд, тоннель, здания, барьеры и деревья. Снимок и производные JSON сохраняются с SHA-256.
- [SIGM Orthophoto 2020 WGS84](https://tiles.arcgis.com/tiles/DkYiS0lDHb5soLgl/arcgis/rest/services/SIGM_Orthophoto_2020_WGS84_2/MapServer), DPUM, Gouvernement Princier de Monaco: официальный публичный ArcGIS tile service, Web Mercator, z18 около 0,60 м/пиксель. Метаданные сервиса документируют съёмку 2020 года и зоны обновлений 2019/2015 годов.
- [VersaTiles elevation](https://docs.versatiles.org/basics/tilesets.html#elevation), CC BY 4.0: Terrarium DEM z12, около 19 м/пиксель, используется только для общего рельефа и профиля улиц вне тоннеля.

Полный машинный манифест с URL каждого запроса, размерами, bbox, CRS и хэшами встроен в `public/f1/tracks/3d/monaco-metadata.json`. Исходные PDF, OSM и тайлы остаются в `.track-model-build/monaco-source/` и не входят в production bundle.

## Права и ограничения

- Ортофото предоставляется официальным публичным сервисом с включённым экспортом тайлов и явной атрибуцией `DPUM, Gouvernement Princier de Monaco`. Отдельная открытая лицензия в метаданных сервиса не указана; при использовании вне RaceSide необходимо повторно проверить условия повторного использования публичной информации Monaco и сохранять источник с датой.
- Ортофото не является снимком гоночного уик-энда 2026 года. Временные трибуны, пит-комплекс и контрольные точки задаются текущими документами FIA/ACM, а не распознаются по снимку.
- OSM-центрлайн имеет длину 3 321,408 м против официальных 3 337 м; ошибка 0,4672% проходит предел 0,5% без искусственного масштабирования координат.
- Terrarium DEM не описывает дорожное полотно внутри тоннеля. Для OSM-интервала 1 390–1 855 м используется отдельный плавный подземный профиль; окружающий рельеф сохраняется в исходной высоте.
- Здания без `height` или `building:levels` получают детерминированную высоту по типу и площади. Это визуальный городской контекст, а не инженерная LoD2-реконструкция фасадов.
