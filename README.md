<div align="center">

<img src="./uivisor.jpg" alt="uivisor" width="100%" />

<p>
  <img alt="npm" src="https://img.shields.io/npm/v/uivisor?style=flat-square&color=cb3837&label=npm" />
  <img alt="dev only" src="https://img.shields.io/badge/только%20dev-в%20прод%20не%20попадает-22c55e?style=flat-square" />
  <img alt="stack" src="https://img.shields.io/badge/React%20·%20Next.js%20·%20Vite-4f46e5?style=flat-square" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-3f3f46?style=flat-square" />
</p>

</div>

Dev-only инструмент для React / Next.js / Vite. Кликни элемент в работающем приложении, поправь его мышкой — панель показывает текущие стили, твои правки подсвечены зелёным. Нажми **Copy prompt for agent** — получишь промпт с `file:line:col`, механизмом стилей и брейкпоинтом, готовый для Claude Code / Cursor.

В исходники не пишет. Правки — временные inline-оверрайды в браузере, пропадают при reload.

---

## Установка

```bash
npm i -D uivisor
```

### Vite + React

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import uivisor from 'uivisor/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [uivisor(), react()], // uivisor() — до react()
})
```

Запусти dev-сервер и нажми **`Alt`+`U`**.

### Next.js (App Router, Next 13–16)

**1. Оберни конфиг:**

```ts
// next.config.ts
import { withUivisor } from 'uivisor/next'
export default withUivisor({ reactStrictMode: true })
```

```js
// next.config.js (CommonJS)
const { withUivisor } = require('uivisor/next')
module.exports = withUivisor({ reactStrictMode: true })
```

**2. Добавь оверлей в корневой layout:**

```tsx
// app/layout.tsx
import { UivisorOverlay } from 'uivisor/next/overlay'

export default function RootLayout({ children }) {
  return <html><body>{children}<UivisorOverlay /></body></html>
}
```

**3. Запусти `next dev` и нажми `Alt`+`U`.**

Работает под обоими бандлерами:

| Команда | Оверлей | Точный `file:line` |
|---|---|---|
| `next dev` (Turbopack, по умолчанию в Next 15/16) | ✅ | ✅ |
| `next dev --webpack` | ✅ | ✅ |

> Чтобы отключить source-mapping под Turbopack: `withUivisor(config, { turbopack: false })` — оверлей продолжит работать, `file:line` доступен через `next dev --webpack`.
>
> Под Turbopack ставь uivisor **из npm** (`npm i -D uivisor`). Локальный `file:`-линк (`file:../uivisor`) Turbopack не резолвит для сабпасов вроде `uivisor/next/overlay` — будет `Module not found`. С webpack `file:`-линк работает.

---

## Работа с панелью

**`Alt`+`U`** — включить/выключить · **`Esc`** — снять выделение · **◎** — кнопка справа снизу.

1. **Кликни любой элемент.** Панель подтягивает его текущие стили: значения из браузера горят белым, правки в uivisor — зелёным.
2. **Правь:**
   - Padding / Margin / Radius — одно поле на все стороны; кнопка **▦** раскрывает по отдельности.
   - Иконка слева от числа (↔) — тяни, значение меняется вживую.
   - Line-height и letter-spacing — переключатель единиц px / % / em.
3. **Screen / breakpoint** — клик на `md` / `lg` / … загружает приложение в виртуальный экран этой ширины (реальные медиа-запросы перестраиваются). В баре — только брейкпоинты твоего проекта. `Live` — реальное окно.
4. **Apply changes to** — куда применить правку:
   - **All N like this** — если компонент повторяется N раз, превью и промпт применяются ко всем; агент правит общий компонент, а не `nth-child`.
   - **Only this one** / существующий `.class` / новый класс с именем.
5. **Copy prompt for agent** — промпт в буфер. **Copy JSON** — машиночитаемый спек.

---

## Промпт для агента

```md
# uivisor — apply these UI tweaks (2 changes across 1 element)

## 1. <button> "Get started" — src/components/PricingCard.tsx:26:7
- Identify by: component <PricingCard>, data-testid="buy-pro"
- Styling: tailwind (current classes: `mt-6 w-full rounded-md px-4 py-2 bg-indigo-600 text-white`)
- At lg breakpoint (≥1024px):
    - padding: 16px → 24px  →  `lg:p-6`
    - background-color: #4f46e5 → #16a34a  →  `lg:bg-[#16a34a]`

### Rules
- Edit the EXISTING className/styles. Do NOT add inline styles or duplicate the component.
- Scope each change to its breakpoint with a responsive variant (e.g. `lg:`).
```

Инструкции агенту:

- Иди по `file:line:col` — главный якорь.
- Правь существующий механизм стилей (`tailwind` / `css-modules` / `styled-components` / `inline`) — не добавляй inline и не дублируй компонент.
- Отдавай responsive-вариант под нужный брейкпоинт.
- `All N like this` — правь общий компонент/класс, не `nth-child`.

---

## Как это устроено

- **Source mapping** — dev-only Babel/loader вешает `data-uiv-src="file:line:col"` на host-JSX. Vite — плагином `enforce: 'pre'`, Next — webpack pre-loader и `turbopack.rules` (SWC сохраняется).
- **Идентичность** — file:line → имя компонента → `data-testid` / id / селектор / текст.
- **Токены** — маппит px в Tailwind-токены (`24px → p-6`, `leading-normal`); arbitrary-значения как фолбэк.
- **Брейкпоинты** — детектятся из `@media`-правил твоего CSS.
- **Responsive-превью** — приложение в ресайзимом iframe, медиа-запросы работают по-настоящему.

## Ограничения

- Только dev-сборки — прод вырезает source-инфо.
- Source mapping — React. DOM/CSS/брейкпоинты — фреймворк-агностично.
- Tailwind — px→токены. Другие стеки — сырые px + указание на CSS-правило.

## Разработка

```bash
npm install
npm run build   # tsup → dist/{vite,babel,overlay,next}
npm test        # vitest
npm run demo    # Vite + React на :5180
```

<div align="center"><sub>MIT · dev-only · prompt-only</sub></div>
