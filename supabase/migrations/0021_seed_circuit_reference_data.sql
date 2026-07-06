-- Backfill circuit dossier fields for the 2026 RaceMate calendar.
-- Historical aggregates are calculated by the worker; this migration fills
-- stable track reference data used by the circuit history popup.

with circuit_reference (
  external_id,
  lap_length_km,
  race_laps,
  race_distance_km,
  turns_count,
  first_grand_prix_year,
  lap_record_time,
  lap_record_driver,
  lap_record_year,
  drs_zones_count,
  track_description,
  overtaking_rating,
  qualifying_importance_rating,
  tyre_wear_rating,
  safety_car_rating,
  strategy_variability_rating,
  rain_risk_rating
) as (
  values
    ('albert_park', 5.278, 58, 306.124, 14, 1996, '1:19.813', 'Charles Leclerc', 2024, 4, 'Быстрая городская трасса в парке: резкие торможения, несколько длинных разгонов и высокая цена ошибки у стен.', 4, 3, 3, 3, 3, 2),
    ('shanghai', 5.451, 56, 305.066, 16, 2004, '1:32.238', 'Michael Schumacher', 2004, 2, 'Широкая техничная трасса с длиннейшей задней прямой и затяжными поворотами, которые нагружают передние шины.', 4, 3, 4, 2, 4, 2),
    ('suzuka', 5.807, 53, 307.471, 18, 1987, '1:30.983', 'Lewis Hamilton', 2019, 1, 'Классическая восьмерка с быстрыми связками, узким ритмом и высокой зависимостью от баланса машины.', 2, 4, 4, 2, 3, 3),
    ('miami', 5.412, 57, 308.326, 19, 2022, '1:29.708', 'Max Verstappen', 2023, 3, 'Современная городская трасса с длинными прямыми, медленной секцией и выраженной ролью прогрева шин.', 4, 3, 3, 3, 3, 2),
    ('villeneuve', 4.361, 70, 305.270, 14, 1978, '1:13.078', 'Valtteri Bottas', 2019, 3, 'Старт-стоп трасса на острове Нотр-Дам: жесткие торможения, атаки поребриков и высокий риск Safety Car.', 4, 3, 2, 4, 3, 3),
    ('monaco', 3.337, 78, 260.286, 19, 1950, '1:12.909', 'Lewis Hamilton', 2021, 1, 'Самая тесная городская трасса календаря: квалификация решает многое, а обгоны почти всегда требуют ошибки соперника.', 1, 5, 2, 4, 2, 2),
    ('catalunya', 4.657, 66, 307.236, 14, 1991, '1:16.330', 'Max Verstappen', 2023, 2, 'Техничная трасса с длинной главной прямой и набором средне-быстрых поворотов, хорошо раскрывающая общий баланс машины.', 3, 4, 4, 2, 3, 2),
    ('red_bull_ring', 4.318, 71, 306.578, 10, 1970, '1:02.939', 'Valtteri Bottas', 2020, 3, 'Короткий и быстрый круг в Шпильберге: длинные разгоны, сильные торможения и компактная дистанция без права на ошибку.', 4, 3, 3, 3, 3, 3),
    ('silverstone', 5.891, 52, 306.198, 18, 1950, '1:27.097', 'Max Verstappen', 2020, 2, 'Скоростная британская классика с Maggotts, Becketts и Chapel: аэродинамика и стабильность в быстрых поворотах решают многое.', 3, 4, 4, 2, 3, 3),
    ('spa', 7.004, 44, 308.052, 19, 1950, '1:46.286', 'Valtteri Bottas', 2018, 2, 'Самая длинная трасса календаря: перепады высот, переменная погода, длинные прямые и быстрые секции создают большой разброс стратегий.', 4, 3, 4, 3, 4, 5),
    ('hungaroring', 4.381, 70, 306.630, 14, 1986, '1:16.627', 'Lewis Hamilton', 2020, 2, 'Плотная и извилистая трасса под Будапештом: обгонять трудно, ритм похож на длинную серию средних и медленных поворотов.', 2, 4, 4, 2, 3, 3),
    ('zandvoort', 4.259, 72, 306.587, 14, 1952, '1:11.097', 'Lewis Hamilton', 2021, 2, 'Узкая трасса у моря с профилированными поворотами, быстрым темпом и ограниченными возможностями для чистой атаки.', 2, 4, 3, 3, 2, 3),
    ('monza', 5.793, 53, 306.720, 11, 1950, '1:21.046', 'Rubens Barrichello', 2004, 2, 'Храм скорости: длинные прямые, тяжелые торможения и минимальная прижимная сила делают слипстрим критически важным.', 4, 3, 2, 3, 3, 2),
    ('madring', 5.416, 57, 308.712, 22, 2026, null, null, null, 2, 'Новая городская трасса вокруг IFEMA в Мадриде: длинный круг, много поворотов и пока минимум гоночной истории Формулы 1.', 3, 3, 3, 3, 3, 2),
    ('baku', 6.003, 51, 306.049, 20, 2016, '1:43.009', 'Charles Leclerc', 2019, 2, 'Городская трасса с очень длинной прямой и узким старым городом: скорость, слипстрим и хаос часто идут рядом.', 5, 3, 2, 5, 4, 2),
    ('marina_bay', 4.940, 62, 306.143, 19, 2008, '1:35.867', 'Lewis Hamilton', 2023, 4, 'Жаркая ночная городская гонка с высокой нагрузкой на пилота, стенами рядом с траекторией и частыми нейтрализациями.', 2, 4, 4, 5, 3, 4),
    ('americas', 5.513, 56, 308.405, 20, 2012, '1:36.169', 'Charles Leclerc', 2019, 2, 'Современная трасса с перепадом высот, широкой первой связкой и несколькими зонами для атаки по ходу круга.', 4, 3, 3, 3, 4, 2),
    ('rodriguez', 4.304, 71, 305.354, 17, 1963, '1:17.774', 'Valtteri Bottas', 2021, 3, 'Высокогорная трасса Мехико снижает эффективность аэродинамики и охлаждения, а длинная стартовая прямая часто меняет сценарий гонки.', 4, 3, 3, 3, 3, 2),
    ('interlagos', 4.309, 71, 305.879, 15, 1973, '1:10.540', 'Valtteri Bottas', 2018, 2, 'Короткий волнистый круг с большим характером: обгоны, переменная погода и плотный трафик часто делают гонку непредсказуемой.', 4, 3, 3, 4, 4, 4),
    ('vegas', 6.201, 50, 309.958, 17, 2023, '1:35.490', 'Oscar Piastri', 2023, 2, 'Сверхбыстрая городская трасса по Лас-Вегас-Стрип: длинные прямые, низкая температура и тяжелое торможение в конце разгонов.', 5, 3, 2, 3, 3, 2),
    ('losail', 5.419, 57, 308.611, 16, 2021, '1:24.319', 'Max Verstappen', 2023, 1, 'Быстрый пустынный автодром с длинными дугами, высокой нагрузкой на шины и ограниченным числом явных зон атаки.', 2, 4, 5, 2, 3, 2),
    ('yas_marina', 5.281, 58, 306.183, 16, 2009, '1:26.103', 'Max Verstappen', 2021, 2, 'Финальный этап сезона на техничной трассе с длинными прямыми, медленными поворотами и вечерним изменением условий.', 3, 3, 3, 2, 3, 2)
)
update public.circuits c
set
  lap_length_km = circuit_reference.lap_length_km,
  race_laps = circuit_reference.race_laps,
  race_distance_km = circuit_reference.race_distance_km,
  turns_count = circuit_reference.turns_count,
  first_grand_prix_year = circuit_reference.first_grand_prix_year,
  lap_record_time = circuit_reference.lap_record_time,
  lap_record_driver = circuit_reference.lap_record_driver,
  lap_record_year = circuit_reference.lap_record_year,
  drs_zones_count = circuit_reference.drs_zones_count,
  track_description = circuit_reference.track_description,
  overtaking_rating = circuit_reference.overtaking_rating,
  qualifying_importance_rating = circuit_reference.qualifying_importance_rating,
  tyre_wear_rating = circuit_reference.tyre_wear_rating,
  safety_car_rating = circuit_reference.safety_car_rating,
  strategy_variability_rating = circuit_reference.strategy_variability_rating,
  rain_risk_rating = circuit_reference.rain_risk_rating
from circuit_reference
where c.external_id = circuit_reference.external_id;
