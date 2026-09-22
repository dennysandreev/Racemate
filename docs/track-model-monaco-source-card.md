# Circuit de Monaco — источники модели

Обновлено 22 сентября 2026 года. Модель заменяет прежний Monaco GLB на странице этапа RaceSide. Это облегчённая географическая реконструкция: точность разных слоёв различается. Съёмки всего города в конфигурации Гран-при 2026 года нет.

## Координаты и масштаб

- План: WGS84 → UTM zone 32N, EPSG:32632.
- Bbox: E 372640–373820, N 4843100–4844620; центр E 373230, N 4843860.
- Вертикальный датум: IGN69, EPSG:5720. Ноль сцены — ноль высотного датума.
- 1 единица Blender = 1 метр, вертикальное преувеличение отсутствует.
- Официальный круг: 3337 м. Геометрия OSM: 3321,408 м, отклонение 0,4672%. Линия не растягивалась ради совпадения чисел.

## Основные источники

| Слой | Источник и дата | Применение и ограничения |
| --- | --- | --- |
| Контрольные точки F1 | [FIA Monaco 2026, Document 7](https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf), июнь 2026 | PDF стр. 2: 19 поворотов, длина, сектора 1051/2470 м, speed trap за 190 м до T10; стр. 3: пит-лейн 11 команд. Copyright FIA, фактический справочный материал; PDF не встроен в модель. |
| Конфигурация события | [FIA / ACM Media Kit 2026](https://www.fia.com/sites/default/files/media_kit_2026_gb_03.06_1.pdf), инженерная схема 27.05.2026 | PDF стр. 13: схема инфраструктуры (печатные стр. 15–16); PDF стр. 31: гаражи 15 × 10,2 м и шаг 17 м (печатные стр. 38–39). Контуры временных трибун вручную совмещены с постоянными границами бассейна и причалов. |
| Трибуны и hospitality | [ACM Hospitality 2026](https://acm.mc/wp-content/uploads/2025/05/Hospitalites_ACM_F12026_F-3.pdf), схема PDF стр. 2 | Группы A, B, E, K, L, N, O, P, T, V, X; 19 моделируемых секций, включая X1/X2. Положение приблизительно ±5 м, высота ±2 м. L/T имеют подтверждённые крытые зоны. |
| Трасса и город | [OSM relation 148194](https://www.openstreetmap.org/relation/148194), закреплённый снимок API | Центральная линия, отдельный пит-лейн, way/relation здания, внутренние кольца, картографированные деревья и берег. © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Точность OSM неоднородна; ширина гоночной ленты упрощена до 9 м. |
| Земля и высоты крыш | [IGN LiDAR HD MNT/MNS](https://www.data.gouv.fr/datasets/mnt-lidar-hd), съёмка 13.05/27.06.2021, публикация 20.06.2025 | Исходные модели 0,5 м, GeoTIFF экспорт 1 м в EPSG:32632; высоты IGN69. IGN, Etalab Open Licence 2.0. MNT используется для земли, MNS — только для высот зданий/деревьев. Полные WMS/WFS URL и каталог дат закреплены в manifest. |
| Цвет земли и крыш | [SIGM Orthophoto 2020 WGS84](https://tiles.arcgis.com/tiles/DkYiS0lDHb5soLgl/arcgis/rest/services/SIGM_Orthophoto_2020_WGS84_2/MapServer), DPUM, Gouvernement Princier de Monaco | Тайлы z18, около 0,60 м/пиксель; сервис 2020 года с зонами съёмки 2019/2015. Выполнена обратная репроекция UTM → Web Mercator, а не растягивание WGS84-вырезки. Copyright DPUM; в метаданных публичного сервиса явная лицензия на перераспространение не указана. Старый неподтверждённый тезис об открытой лицензии удалён. |
| Этажность гаражей | [Audi, The race between races](https://www.audif1.com/en/news/2026/the-race-between-races), 10.06.2026 | Подтверждены три этажа и отдельное расположение паддока. Высота 9,3 м — оценка 3 × 3,1 м; это не инструментальная съёмка. Статья сохранена с SHA-256, изображения не включены в модель. |

Поддерживающая карта FIA `2026_monaco_event_-_circuit_map_-_monaco_2026_v1.pdf` относится к support series. Она используется только для сравнения общей геометрии. Контрольные точки F1 взяты из Document 7. Файл `acm-2026-formula-1-event-map.jpg` в старом кеше фактически содержит билетный каталог; его роль ограничена перечнем трибун.

## Как построена геометрия

Рельеф построен по MNT с шагом сетки 5 м. No-data и отрицательные артефакты ниже −10 м отбрасываются; водная поверхность ограничена береговой геометрией. Дорога использует сглаженный профиль MNT с окном 34 м. Максимальная коррекция вне тоннеля — 3,987 м; наибольший уклон 10,43%. Под полотном рельеф локально подгоняется по реальным треугольникам дороги, а не поднимается весь круг.

Главный тоннель ограничен картографированными порталами на 1514,90–1876,65 м круга: 361,75 м. Отдельное перекрытие Portier — 18 м. Подземные отметки интерполированы между порталами; LiDAR не измеряет проезжую часть под крышей.

Город содержит 1023 footprint, включая 22 мультиполигона. Восстановлены внутренние кольца и крупные объекты Fairmont (`relation/2093796`), Hôtel de Paris (`relation/8280869`), Yacht Club (`relation/8269572`). У 1019 объектов высота крыши измерена по MNS, у четырёх применены явные OSM height/levels. Случайных высот нет. Крыши плоские LoD1, окрашены ортофото в мировых координатах. Все внешние стены и стены дворов покрыты четырьмя оригинальными повторяемыми текстурами: штукатурка, окна, рамы, ставни и ограждения балконов. Развёртка рассчитывается по каждой стене с предполагаемой высотой этажа около 3,2 м. Это визуальная реконструкция, а не фотографии конкретных адресов. Открытая LoD2-модель для этой зоны не была найдена.

Здания, конфликтующие с трассой, пит-лейном и зарезервированными трибунами, исключаются с записью ID и причины. Над тоннелем сохраняется допустимый верхний объём Fairmont. У трибун есть ряды, боковины и опоры. Гаражи следуют изгибу улицы, чтобы углы прямоугольных коробок не перекрывали fast lane. Между гаражами сохраняется сервисный проезд. Пит-волл и защитные рейки — объёмные объекты.

Стартовая ферма стоит на проверенной контрольной линии; размеры рамы являются реконструкцией. Поребрики добавлены на характерных апексах, а не по всему периметру. Отдельные порты, спонсорские щиты и малые временные объекты не воспроизводятся.

## Неподтверждённые детали

Крупные моторхоумы команд 2026 года не созданы: планы подтверждают паддок на Quai Antoine Ier, но не дают проверяемые индивидуальные footprint, высоты и размещение новых hospitality Audi/Cadillac и других команд. Прежние 11 произвольных коробок удалены. На месте паддока остаётся историческое ортофото. Это незакрытый пункт полной событийной детализации из playbook.

Покрытие 2020 года и высоты 2021 года не отражают всех изменений города, в частности нового состояния Mareterra. Постоянная ширина полотна 9 м также не заменяет съёмку реальных границ ограждений. Эти ограничения записаны непосредственно в metadata; модель нельзя выдавать за полную съёмку 2026 года. Перед публичным перераспространением ортофото необходимо подтвердить соответствующие условия DPUM.

## Воспроизводимость

[Закреплённый manifest](track-model-monaco-source-manifest.json) и `public/f1/tracks/3d/monaco-metadata.json` содержат URL, даты, bbox, CRS, датум, разрешение, размеры и SHA-256 каждого файла и тайла. Кеш находится в `.track-model-build/monaco-source/`; повторная сборка проверяет хеши и не обновляет исходные байты. `--force-sources` явно обновляет снимок и требует повторной приёмки.

Terrarium z12 сохранён в историческом кеше для происхождения прежней модели, но больше не используется как источник высот. Фото FIA/ACM/Audi используются как справочные материалы и не встраиваются в GLB.

## Corrections after visual review, 22 September

The two OSM pit ways ended on the racing line. Their previous straight connection produced a false early merge. The mapped working lane is retained; the missing exit is reconstructed beside the start straight (estimated width 4 m, centre separation 7.5 m), then smoothly connected to the mapped Sainte Devote branch and its original merge point. FIA Document 7 provides the layout reference; these widths are not surveyed. Replay and Blender use the same corrected path. Shared main/pit asphalt is subtracted from the pit mesh; edge paint terminates at the junctions.

Turn labels no longer have a 13-16 m lateral offset. Their longitudinal positions were checked against apexes on the registered centreline and the FIA corner sequence. Sector distances remain independently fixed at 1051/2470 m.

Both the main tunnel and the short Portier cover have terrain openings, a continuous roadbed and portal frames with 11.8 m clear width and 5.3 m clear height. A 6 m entrance collar places each entrance frame in front of the overhanging LoD1 building. The original underground ranges remain mapped OSM data; frame/collar dimensions are reconstructed. The decoded GLB audit checks the portal mouths for terrain obstruction.
