# Typography Direction

Pagi Pagi Padel uses quiet, compact admin typography. The type should feel
friendly enough for front-desk operators, but still dense enough for repeated
calendar work.

## Font Family

Use the shared `--font-sans` token from `src/styles/base.css`.

```css
--font-sans: "Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif;
```

Do not add screen-specific font families. The Avenir/Helvetica direction is part
of the product language; the Arial fallback keeps the app legible on systems
without Avenir or Helvetica.

Use `--font-mono` only for technical values such as commit hashes.

## Size Scale

Use the type tokens in `src/styles/base.css` instead of one-off pixel values.

```css
--font-size-2xs: 0.75rem;       /* 12px labels, metadata, dense chips */
--font-size-xs: 0.8125rem;      /* 13px operational UI text */
--font-size-sm: 0.875rem;       /* 14px secondary body text */
--font-size-md: 0.9375rem;      /* 15px form/content emphasis */
--font-size-base: 1rem;         /* 16px default text */
--font-size-lg: 1.125rem;       /* 18px local section emphasis */
--font-size-xl: 1.375rem;       /* 22px panel titles */
--font-size-2xl: 1.5rem;        /* 24px compact page/card titles */
--font-size-3xl: 1.625rem;      /* 26px mobile large titles */
--font-size-4xl: 1.75rem;       /* 28px drawer/dialog titles */
--font-size-5xl: 2rem;          /* 32px login/hero-lite titles */
--font-size-page-title: 2.375rem; /* 38px desktop page titles */
```

Calendar labels, chips, metadata, and helper text should usually be
`--font-size-2xs` or `--font-size-xs`. Avoid going below `--font-size-2xs`; the
calendar already carries a lot of dense information and tiny labels become hard
to scan.

Do not scale font size with viewport width. Use responsive layout changes
instead of `vw`-based type or `clamp()` for font sizing.

## Weights

Use the four shared weight tokens.

```css
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

Use regular or medium for body text, form values, inactive nav, and explanatory
copy. Use semibold for controls, labels, chips, and active nav. Use bold for page
titles, selected state emphasis, dates, booking names, and numbers that need to
anchor a row.

Avoid numeric one-offs such as `650`, `750`, or `800`. They make the UI harder
to tune across browsers and system font fallbacks.

## Tracking And Line Height

Keep letter spacing at `--letter-spacing-tight`, which is `0`. Do not use
negative tracking; it makes large headings feel compressed and can hurt fallback
rendering.

Use these line-height tokens when adding new text blocks:

```css
--line-height-tight: 1.15;
--line-height-snug: 1.3;
--line-height-normal: 1.5;
--line-height-relaxed: 1.55;
```

Dense labels and single-line values can use tight or snug line-height. Body copy,
helper text, and explanatory content should use normal or relaxed line-height.

## Practical Rules

- Reach for tokens first; add a new token only when an existing token clearly
  cannot express the hierarchy.
- Keep desktop page titles at `--font-size-page-title`; use panel title sizes
  inside cards, drawers, dialogs, and sidebars.
- Keep mobile type in rem-based tokens so it continues to track user text-size
  preferences.
- Preserve the current compact admin density. Increase spacing or layout
  clarity before making text unusually large or heavy.
- When typography changes materially, refresh the visual-reference screenshots.
