export const nextSession = {
  race: "Гран-при Канады",
  circuit: "Жиль-Вильнев",
  session: "Практика 1",
  startsAt: "Пт, 21:30 МСК",
  status: "До старта 2 дня",
};

export const newsItems = [];

export const standings = [
  { position: 1, driver: "Макс Ферстаппен", team: "Red Bull", points: 169 },
  { position: 2, driver: "Ландо Норрис", team: "McLaren", points: 149 },
  { position: 3, driver: "Шарль Леклер", team: "Ferrari", points: 138 },
  { position: 4, driver: "Оскар Пиастри", team: "McLaren", points: 132 },
];

export const predictionPicks = [
  { label: "Победитель", value: "Ландо Норрис" },
  { label: "Поул", value: "Шарль Леклер" },
  { label: "Топ-3", value: "Norris, Verstappen, Leclerc" },
  { label: "Лучший круг", value: "Оскар Пиастри" },
];

export const adminSignals = [
  { label: "RSS источники", value: "14", status: "Все активны" },
  { label: "AI очередь", value: "8", status: "В пределах лимита" },
  { label: "F1 sync", value: "12 мин", status: "Последний успех" },
];

export const calendarEvents = [
  {
    season: 2026,
    round: 10,
    race: "Гран-при Канады",
    circuit: "Жиль-Вильнев",
    country: "Canada",
    countryFlag: "🇨🇦",
    date: "12-14 июня",
    status: "Текущий этап",
    href: "/calendar/2026/10",
  },
  {
    season: 2026,
    round: 11,
    race: "Гран-при Австрии",
    circuit: "Ред Булл Ринг",
    country: "Austria",
    countryFlag: "🇦🇹",
    date: "26-28 июня",
    status: "Ожидается",
    href: "/calendar/2026/11",
  },
  {
    season: 2026,
    round: 12,
    race: "Гран-при Великобритании",
    circuit: "Сильверстоун",
    country: "United Kingdom",
    countryFlag: "🇬🇧",
    date: "3-5 июля",
    status: "Ожидается",
    href: "/calendar/2026/12",
  },
];

export const weekendSessions = [
  {
    name: "Практика 1",
    startsAt: "Пт, 21:30 МСК",
    status: "Ожидается",
  },
  {
    name: "Практика 2",
    startsAt: "Сб, 01:00 МСК",
    status: "Ожидается",
  },
  {
    name: "Квалификация",
    startsAt: "Сб, 23:00 МСК",
    status: "Прогнозы закроются заранее",
  },
  {
    name: "Гонка",
    startsAt: "Вс, 21:00 МСК",
    status: "Главное событие",
  },
];

export const leagues = [
  {
    name: "Гараж на диване",
    members: 18,
    leader: "Денис",
    score: 128,
  },
  {
    name: "Поздний пит-стоп",
    members: 9,
    leader: "Марина",
    score: 116,
  },
  {
    name: "Команда без приказов",
    members: 24,
    leader: "Илья",
    score: 109,
  },
];

export const adminJobs = [
  {
    name: "rss.fetch_all",
    status: "Успешно",
    processed: 42,
    finishedAt: "5 мин назад",
  },
  {
    name: "news.ai_summarize",
    status: "В работе",
    processed: 8,
    finishedAt: "Сейчас",
  },
  {
    name: "jolpica.sync_results",
    status: "Успешно",
    processed: 3,
    finishedAt: "12 мин назад",
  },
];

export const polls = [
  {
    question: "Кто удивит в Канаде?",
    options: ["Aston Martin", "Williams", "Alpine"],
    votes: 842,
  },
  {
    question: "Главная интрига уикенда",
    options: ["Темп Ferrari", "Шины McLaren", "Штрафы FIA"],
    votes: 617,
  },
];
