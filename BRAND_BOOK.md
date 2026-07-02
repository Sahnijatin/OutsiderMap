# OutsiderMap — Brand Book

> **Your city, your taste.** One confident answer, not ten thousand options.

This document is the single source of truth for the OutsiderMap brand: the
voice, the palette, the type, the logo, and the rules for using them. It is
derived directly from the live design system (`src/app/globals.css`,
`src/app/layout.tsx`, the component library, and the marketing surfaces).
When code and this document disagree, treat the `@theme` block in
`globals.css` as canonical and update this document to match.

---

## 1. Brand at a glance

| | |
|---|---|
| **Name** | OutsiderMap (one word, capital O, capital M) |
| **Category** | Hyper-personalized city discovery — Delhi first |
| **Promise** | Tell us your mood; we already know your taste; get *the* answer. |
| **Primary line** | Ten thousand places. One answer. |
| **Tagline** | Your city, your taste. |
| **Home base** | Delhi · "Made for Delhi" |
| **Mode** | Dark-only. There is no light theme. |
| **Feeling** | Cinematic, minimal, nocturnal, confident, a little underground. |

The design *is* the brand. OutsiderMap should always feel like the city at
3am: warm, low-lit, a little secret, and absolutely sure of itself.

---

## 2. Brand story & positioning

People hit **decision paralysis at the moment of intent**. You know your mood
("it's 3am and I want something") but generic tools give you ten thousand
options and none of them know *you*. OutsiderMap builds a personal taste
profile and collapses those options into one confident, personal answer.

Everything in the brand exists to express that single move: **many → one**.
The scattered city lights converging to a single bright point is not
decoration; it is the product thesis, enacted.

**Voice pillars**
- **Confident, not chatty.** We give the answer, then the reason. We don't
  hedge or present a menu.
- **Nocturnal & intimate.** Written for late nights and real moods, including
  the unglamorous ones ("slightly heartbroken, want greasy food").
- **Knowing, not gimmicky.** We sound like a friend with great taste who
  actually knows the city — never like a listings site.
- **Underground-aware.** "If it's on Google, it doesn't count."

---

## 3. Color

The palette is derived from **Delhi's actual night light**: the sky over the
city is a warm amber-brown haze (never blue-black), streets are lit by
sodium-vapor lamps, and neon belongs to the underground. Every token is a real
CSS custom property in `globals.css` and is consumable as a Tailwind utility
(`bg-night`, `text-ink`, `border-line`), from Motion variants, and from R3F
materials via `getComputedStyle`.

> **Rule:** Never hardcode colors in components. Use the tokens.

### 3.1 Core palette

| Token | Hex | Tailwind | Role |
|---|---|---|---|
| **Night** | `#0c0a08` | `night` | Primary background. Warm asphalt black with a brown undertone. Also the browser `themeColor`. |
| **Surface** | `#16120e` | `surface` | Cards, panels, raised containers. |
| **Raise** | `#1e1914` | `raise` | Highest elevation: chips, default badges, skeletons. |
| **Line** | `#2b241c` | `line` | Borders, dividers, hairlines. |
| **Ink** | `#ede7db` | `ink` | Primary text — a warm paper-white, never pure white. |
| **Ink Dim** | `#9b9183` | `ink-dim` | Secondary text, captions, the muted system voice. |

### 3.2 Accent & signal colors

| Token | Hex | Tailwind | Role |
|---|---|---|---|
| **Accent (Sodium Amber)** | `#f0a431` | `accent` | **The default voice of the brand.** Primary actions, focus rings, highlights, the "one answer" point, the logo dot. |
| **Ember** | `#c87c1f` | `ember` | Deeper amber. Primary-button hover state; secondary light color in the hero field. |
| **Under (Neon Violet)** | `#b48aed` | `under` | **Reserved exclusively for underground / premium.** Never use it for ordinary UI. |
| **Danger** | `#e0654f` | `danger` | Errors and destructive actions only. |

### 3.3 The two-accent discipline (important)

OutsiderMap runs on **two accents with strict, separate jobs**:

- **Amber (`accent`)** is the everyday brand color — free product, primary
  CTAs, the recurring sodium-lamp glow.
- **Violet (`under`)** means *underground / premium and nothing else*. A violet
  halo, badge, or border is a promise that something is exclusive. Using violet
  for a generic button breaks that promise and dilutes the conversion signal.

When in doubt, it's amber.

### 3.4 Lighting motifs (derived tokens)

These are brand textures built from the palette, defined as utility classes:

- **`.halo`** — a soft radial sodium-lamp glow in amber (~14% accent → transparent).
  The recurring lighting motif behind heroes and CTAs.
- **`.halo-under`** — the same glow in violet (~12% under → transparent),
  used only behind premium/underground sections.
- **`::selection`** — text selection is amber at 30% opacity.

### 3.5 Usage tints

Accent and violet are routinely used at low opacity for soft signal surfaces:
`bg-accent/15` + `text-accent` (accent badge), `bg-under/15` + `text-under`
(premium badge), `border-under/30` (premium card border). Keep tints subtle —
the palette's power comes from a near-black canvas with sparing, glowing light.

---

## 4. Typography

Three typefaces, each with a distinct job. They are wired as CSS variables in
`layout.tsx` (`next/font/google`) and exposed as `--font-display`,
`--font-body`, and `--font-mono`.

| Role | Typeface | Token / Tailwind | Used for |
|---|---|---|---|
| **Display** | **Fraunces** (with `SOFT`, `WONK`, `opsz` axes) | `--font-display` / `font-display` | Headlines, the wordmark, big editorial moments. Often *italic* for the punchline. |
| **Body** | **Geist Sans** | `--font-body` / default | All running text, UI labels, paragraphs. |
| **Mono** | **Geist Mono** | `--font-mono` / `font-mono` | The "system voice": eyebrows, timestamps, query input, metadata, fine print. |

### 4.1 The display signature

Headlines follow a consistent rhythm: a statement in upright Fraunces, then the
key phrase in **italic amber** (or italic violet in premium contexts).

> Ten thousand places. *One answer.*
> A profile that gets you, *then gets better.*
> The weekend, planned. *The underground, open.*
> The city already knows *you're coming.*

This "upright setup → italic accent payoff" is the most recognizable verbal
pattern in the brand. Use it for hero and section headlines.

### 4.2 The system voice (`.voice`)

The `.voice` class is the brand's machine-whisper — small mono eyebrows and
timestamps that frame content:

```
font: mono · 0.6875rem · letter-spacing 0.3em · uppercase · color ink-dim
```

Examples: `DELHI · 3:00 AM`, `RIGHT NOW MODE · FREE`, `WHEN YOU WANT MORE`,
`MADE FOR DELHI`. It always sits *above* a display headline and is always
quiet (ink-dim, never accent).

### 4.3 The wordmark in text

In navigation and footer the wordmark "OutsiderMap" is set in **Fraunces
italic** (`font-display italic`). This is the typographic logo lockup — see §5.

---

## 5. Logo & icon

### 5.1 The mark — "the one answer"

The app icon (`src/app/icon.svg`) is the brand thesis in miniature: a rounded
night-black tile with one bright amber circle at the optical center and a few
faint amber points scattered around it — ten thousand city lights collapsing to
the single answer.

```
Tile:    64×64, corner radius 14, fill #0c0a08 (night)
Answer:  central circle r=9, fill #f0a431 (accent)
Field:   4 small dots, #f0a431 at 0.4–0.55 opacity, scattered
```

**Construction rules**
- The central amber dot is *the* answer — always the brightest, always
  centered, never decorative.
- Surrounding lights are faint (≤ 55% opacity) and few. They suggest a field
  without competing with the center.
- The tile is night, not pure black, with a generous corner radius.

### 5.2 The wordmark

Set "OutsiderMap" in **Fraunces italic**. One word, capital O and capital M, no
space, no hyphen. In compact lockups it pairs with the system voice beneath it
(e.g. wordmark + `MADE FOR DELHI`).

### 5.3 Social / OG lockup

The Open Graph image (`src/app/opengraph-image.tsx`) is the canonical
"hero lockup": a night canvas, ~90 scattered amber lights, a glowing amber
answer-point with a soft halo, the headline "Ten thousand places. *One
answer.*" (the payoff in italic amber), and the kicker `OUTSIDERMAP · DELHI`
in spaced uppercase ink-dim. Reuse this composition for share cards and
promotional art.

### 5.4 Clear space & don'ts

- Give the mark clear space; let the night breathe around it.
- **Don't** recolor the answer dot (it is always `accent`, except violet only
  in an explicitly premium/underground lockup).
- **Don't** add more than a sparse handful of background lights.
- **Don't** set the wordmark upright/bold or in the body or mono faces — it is
  Fraunces italic.
- **Don't** place the mark on a light background. The brand is dark-only.

---

## 6. Motion

Motion is core to the brand — "cinematic, minimal, motion-rich." Presets live
in `src/components/motion/primitives.ts`.

### 6.1 Signature easing

One easing curve defines the brand's feel — a long, confident settle:

```
easeOutExpo = cubic-bezier(0.16, 1, 0.3, 1)
```

Also exposed as the `--ease-out-expo` CSS token. Default transition duration is
**0.8s**.

### 6.2 Standard entrances

| Variant | Behavior | Use |
|---|---|---|
| `fadeUp` | opacity 0→1, y 24→0 | The default reveal for almost everything. |
| `fade` | opacity 0→1 | Subtle fades. |
| `scaleIn` | opacity 0→1, scale 0.96→1 | Cards, focal elements. |
| `stagger` | 0.12s between children, 0.1s delay | Grouped reveals (hero, lists). |
| `staggerSlow` | 0.18s between children, 0.15s delay | Full-section reveals. |

### 6.3 The signature scene — Convergence Field

`src/components/three/ConvergenceField.tsx` is the one hero R3F moment: a field
of ~1,400 sodium-amber city lights drifts, then **collapses into a single
bright point** (the answer), holds and breathes, then scatters again on a
~10.5s loop. Lights are mostly amber, some ember, a few warm-white, additively
blended over night. A gentle pointer parallax tilts the camera.

This scene *is* the product story. Use it as the signature, not a background
gimmick; one is enough.

### 6.4 Accessibility — reduced motion is non-negotiable

`prefers-reduced-motion` is respected globally (`globals.css` zeroes animation
and transition durations) and per-component: the Convergence Field renders as a
**static night-city scatter**, the typing demo shows its final state instantly.
Always honor it.

---

## 7. Components & UI language

The design-system primitives live in `src/components/ui`. Shared traits:
**fully rounded pills** for actions, **soft rounded cards** (`--radius-card:
1.25rem`), hairline `line` borders, amber focus, generous dark space.

### 7.1 Buttons (`button.tsx`)

Pill-shaped (`rounded-full`), medium weight, 200ms color transitions.

| Variant | Look | Use |
|---|---|---|
| `primary` | `bg-accent text-night`, hover `bg-ember` | The main call to action. Amber on night. |
| `secondary` | transparent, `border-line`, hover `border-ink-dim` | Secondary actions, "Sign in". |
| `ghost` | `text-ink-dim`, hover `text-ink` | Tertiary / inline. |
| `danger` | `border-danger/40 text-danger`, hover `bg-danger/10` | Destructive only. |
| `under` | `bg-under text-night`, hover `bg-under/80` | Premium/underground actions only. |

Sizes: `sm` (h-8), `md` (h-11), `lg` (h-13). Primary buttons read in
sentence-confident voice: "Get your taste profile", "See how it works".

### 7.2 Badges (`badge.tsx`)

Small rounded-full tags. `default` (raise/ink-dim), `accent` (amber tint —
e.g. "matched to your profile"), `under` (violet tint — "Premium"), `outline`.

### 7.3 Cards (`card.tsx`)

`rounded-card border border-line bg-surface p-6`. The default container.
Premium cards may switch the border to `border-under/30`.

### 7.4 Inputs (`input.tsx`)

Rounded-xl, `bg-surface`, `border-line`, placeholder at `ink-dim/60`, and an
**amber focus border** (`focus:border-accent`). Inputs, textareas, and selects
share the same field styling.

### 7.5 Focus & loading

- **Focus:** every focusable element gets a 2px amber `:focus-visible` outline
  with 2px offset. Visible keyboard focus is a brand requirement.
- **Spinner / Skeleton:** spinner is a `line` ring with an amber top
  (`border-t-accent`); skeletons pulse in `raise`.

### 7.6 The "Right Now" surface pattern

The product's core interaction (see `demo.tsx`) is a terminal-like exchange:
a mono prompt with an amber `>` caret, the user's natural-language query typed
in, then **one answer card** — name in Fraunces display, meta in ink-dim, a
short bulleted "why" with amber `·` markers, and an amber "matched to your
profile" badge. Lead with the answer; justify it in two or three tight lines.

---

## 8. Voice & tone — writing for OutsiderMap

**Do**
- Give one answer, then the reason. ("Moolchand Parathewala — greasy enough to
  fix the night. Open when nothing else is.")
- Write for real, late, human moods, lowercase and unfiltered in user-voice
  examples ("im at GK, slightly heartbroken, want greasy food").
- Use the upright→italic-accent headline rhythm for big statements.
- Keep system framing in the quiet mono `.voice`.
- Lean into the nocturnal, slightly secret tone for premium ("Parties without
  posters", "If it's on Google, it doesn't count").

**Don't**
- Present a menu of ten options or hedge ("you could try…").
- Sound like a corporate listings site or use generic hype.
- Spend the violet/underground signal on ordinary copy.
- Promise more cities loudly — it's "Delhi first," "more cities later."

**Reference lines (canon)**
- Ten thousand places. One answer.
- Your city, your taste.
- Ask at 3am. Mean it.
- The weekend, planned. The underground, open.
- The city already knows you're coming.
- Made for Delhi.

---

## 9. Quick reference — design tokens

```css
/* Color */
--color-night:    #0c0a08;  /* bg */
--color-surface:  #16120e;  /* cards */
--color-raise:    #1e1914;  /* chips, badges */
--color-line:     #2b241c;  /* borders */
--color-ink:      #ede7db;  /* text */
--color-ink-dim:  #9b9183;  /* muted text */
--color-accent:   #f0a431;  /* sodium amber — the brand */
--color-ember:    #c87c1f;  /* amber hover / depth */
--color-under:    #b48aed;  /* neon violet — premium only */
--color-danger:   #e0654f;  /* errors only */

/* Type */
--font-display: Fraunces;     /* headlines, wordmark (italic) */
--font-body:    Geist Sans;   /* everything */
--font-mono:    Geist Mono;   /* system voice, timestamps */

/* Form */
--radius-card:   1.25rem;
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

---

*Maintained alongside the codebase. The `@theme` block in
`src/app/globals.css` is canonical; update this book whenever the tokens,
fonts, or signature components change.*
