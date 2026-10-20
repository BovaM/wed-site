export const CONFIG = {
  names: ['Мария', 'Максим'],
  eventDate: '2026-11-01T15:00:00+03:00', // Europe/Moscow
  invitation: 'Будем рады разделить этот день с вами',
  dressCode: 'серый, please',
  places: {
    zags: {
      name: 'ЗАГС #1',
      lat: 55.765975,
      lng: 37.644818,
      yandexUrl:
        'https://yandex.ru/maps/org/dvorets_brakosochetaniya_1/1241193732/?ll=37.644818%2C55.765975&z=16',
    },
    mansion: {
      name: 'Особняк Василия Хлудова',
      lat: 55.769884,
      lng: 37.659668,
      yandexUrl:
        'https://yandex.ru/maps/org/21_kult/126234753565/?ll=37.659668%2C55.769884&z=16.75',
    },
  },
};

/** Дословный текст с обратной стороны маски. */
export const MASK_LINES = [
  { text: '01.11', kind: 'date' },
  { text: '15:00', kind: 'time' },
  { text: 'ЗАГС #1', kind: 'place', place: 'zags' },
  { text: '17:00', kind: 'time' },
  { text: 'candy bar', kind: 'note' },
  {
    text: 'в особняке Василия Хлудова',
    kind: 'place',
    place: 'mansion',
  },
  { text: 'dress code: серый, please', kind: 'dresscode' },
];


