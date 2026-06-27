/**
 * Tiny i18n for the overlay UI. Keys are the English strings themselves, so an
 * untranslated string falls back to readable English. Language is detected from
 * the browser (ru → Russian) and can be toggled in the panel header; the choice
 * persists in localStorage.
 */
export type Lang = 'en' | 'ru'

const RU: Record<string, string> = {
  // chrome / buttons
  'Toggle uivisor (Alt+U)': 'Вкл/выкл uivisor (Alt+U)',
  'Turn uivisor off (Alt+U)': 'Выключить uivisor (Alt+U)',
  Close: 'Закрыть',
  'Drag to resize': 'Потяните, чтобы изменить ширину',
  'Drag to change': 'Потяните, чтобы изменить',
  'Copy prompt for agent': 'Скопировать промпт для агента',
  'Copy JSON': 'Скопировать JSON',
  Reset: 'Сбросить',
  'Revert tweaks on selected element': 'Откатить правки выбранного элемента',
  Clear: 'Очистить',
  'Clear all': 'Очистить всё',
  Unit: 'Единица',
  Token: 'Токен',
  'pick token': 'выберите токен',
  Mixed: 'разные',
  'Edit each side individually': 'Редактировать каждую сторону отдельно',
  // apply-changes-to
  'Apply changes to': 'Применить изменения к',
  'This element': 'Этому элементу',
  'Only this one': 'Только этому',
  'All {n} like this': 'Всем таким ({n})',
  'New class…': 'Новый класс…',
  'new class name': 'имя нового класса',
  'Create a new class instead of touching the existing ones':
    'Создать новый класс вместо изменения существующих',
  // legend
  file: 'из файла',
  edited: 'изменено',
  inherited: 'наследуется',
  auto: 'авто',
  // empty / hint
  'Click any element in the frame to select it.':
    'Кликните по элементу во фрейме, чтобы выбрать его.',
  'Click any element on the page to select it.':
    'Кликните по элементу на странице, чтобы выбрать его.',
  'Alt+U toggles · Esc deselects · ⌘/Ctrl+Z undo, ⇧ to redo. Tweaks stay in the browser — nothing is written to your code.':
    'Alt+U — вкл/выкл · Esc — снять выбор · ⌘/Ctrl+Z — отменить, ⇧ — вернуть. Правки живут только в браузере — в код ничего не пишется.',
  // floating "all styles" readout
  'all styles': 'все стили',
  computed: 'вычислено',
  // design system
  'Design system': 'Дизайн-система',
  'tokens detected': 'токенов найдено',
  // frame readout
  editing: 'правим',
  'No breakpoint — applies to every size by default':
    'Без брейкпоинта — применяется ко всем размерам',
  // toasts
  'No tweaks recorded yet': 'Пока нет ни одной правки',
  'Prompt copied ✓': 'Промпт скопирован ✓',
  'JSON copied ✓': 'JSON скопирован ✓',
  'Nothing to undo': 'Нечего отменять',
  'Undo ↩': 'Отменено ↩',
  'Nothing to redo': 'Нечего возвращать',
  'Redo ↪': 'Возвращено ↪',
  // section titles
  Layout: 'Раскладка',
  Size: 'Размер',
  Spacing: 'Отступы',
  Border: 'Граница',
  Typography: 'Типографика',
  Fill: 'Заливка',
  // control labels
  Display: 'Тип',
  Direction: 'Направление',
  Justify: 'Распред.',
  Align: 'Выравнив.',
  Wrap: 'Перенос',
  Width: 'Ширина',
  Height: 'Высота',
  'Max W': 'Макс Ш',
  'Min H': 'Мин В',
  Padding: 'Внутр. отступ',
  Margin: 'Внешн. отступ',
  Gap: 'Промежуток',
  Radius: 'Скругление',
  Weight: 'Насыщенность',
  Line: 'Высота строки',
  Text: 'Текст',
  Background: 'Фон',
}

const DICT: Record<Lang, Record<string, string>> = { en: {}, ru: RU }

function detect(): Lang {
  try {
    const saved = localStorage.getItem('uiv-lang')
    if (saved === 'en' || saved === 'ru') return saved
  } catch {
    /* localStorage may be blocked */
  }
  try {
    if (typeof navigator !== 'undefined' && /^ru\b/i.test(navigator.language || '')) return 'ru'
  } catch {
    /* noop */
  }
  return 'en'
}

let lang: Lang = detect()

export function getLang(): Lang {
  return lang
}

export function setLang(next: Lang): void {
  lang = next
  try {
    localStorage.setItem('uiv-lang', next)
  } catch {
    /* noop */
  }
}

/** Translate `key`, substituting `{name}` placeholders from `vars`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let out = DICT[lang][key] ?? key
  if (vars) for (const k of Object.keys(vars)) out = out.replace(`{${k}}`, String(vars[k]))
  return out
}
