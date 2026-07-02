#!/usr/bin/env python3
"""Render the OutsiderMap brand book to a branded, on-palette PDF.

Standalone: pulls the canonical token values inline so the PDF matches the
codebase (src/app/globals.css). Run: python3 scripts/make_brand_pdf.py
"""
from fpdf import FPDF

# --- Brand tokens (canonical, from src/app/globals.css) ---
NIGHT = (12, 10, 8)        # #0c0a08
SURFACE = (22, 18, 14)     # #16120e
RAISE = (30, 25, 20)       # #1e1914
LINE = (43, 36, 28)        # #2b241c
INK = (237, 231, 219)      # #ede7db
INK_DIM = (155, 145, 131)  # #9b9183
ACCENT = (240, 164, 49)    # #f0a431
EMBER = (200, 124, 31)     # #c87c1f
UNDER = (180, 138, 237)    # #b48aed
DANGER = (224, 101, 79)    # #e0654f

PAGE_W, PAGE_H = 210, 297  # A4 mm
MARGIN = 18
CONTENT_W = PAGE_W - 2 * MARGIN


class Brand(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_y(10)
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(*INK_DIM)
        self.cell(0, 6, "OutsiderMap  ·  Brand Book", align="L")
        self.cell(0, 6, "Made for Delhi", align="R")
        self.set_draw_color(*LINE)
        self.set_line_width(0.2)
        self.line(MARGIN, 18, PAGE_W - MARGIN, 18)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-14)
        self.set_font("Courier", "", 8)
        self.set_text_color(*INK_DIM)
        self.cell(0, 6, f"© 2026 OutsiderMap", align="L")
        self.cell(0, 6, f"{self.page_no():02d}", align="R")

    def paint_bg(self):
        self.set_fill_color(*NIGHT)
        self.rect(0, 0, PAGE_W, PAGE_H, "F")

    def add_page(self, *a, **k):
        super().add_page(*a, **k)
        self.paint_bg()


pdf = Brand(orientation="P", unit="mm", format="A4")
pdf.set_auto_page_break(auto=True, margin=20)
pdf.set_title("OutsiderMap Brand Book")
pdf.set_author("OutsiderMap")

# The built-in core fonts are latin-1 only; fold the few smart-typography
# characters used in copy down to safe equivalents.
_REPL = {
    "—": "-", "–": "-", "‘": "'", "’": "'",
    "“": '"', "”": '"', "…": "...", "→": "->",
    "·": "·", "₹": "Rs ",
}


def _san(s):
    if not isinstance(s, str):
        return s
    for k, v in _REPL.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


_orig_cell, _orig_mc = pdf.cell, pdf.multi_cell
pdf.cell = lambda *a, **k: _orig_cell(*(_san(x) for x in a),
                                     **{kk: _san(vv) for kk, vv in k.items()})
pdf.multi_cell = lambda *a, **k: _orig_mc(*(_san(x) for x in a),
                                          **{kk: _san(vv) for kk, vv in k.items()})


# ---------- helpers ----------
def voice(text, y=None):
    """The system-voice eyebrow: mono, uppercase, tracked, dim."""
    if y is not None:
        pdf.set_y(y)
    pdf.set_x(MARGIN)
    pdf.set_font("Courier", "", 8)
    pdf.set_text_color(*INK_DIM)
    pdf.cell(0, 5, "  ".join(text.upper()))
    pdf.ln(7)


def h2(text, accent_tail=None):
    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*INK)
    if accent_tail:
        w = pdf.get_string_width(text + " ")
        pdf.cell(w, 9, text)
        pdf.set_font("Helvetica", "BI", 18)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 9, accent_tail)
    else:
        pdf.cell(0, 9, text)
    pdf.ln(11)


def h3(text, color=INK):
    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*color)
    pdf.multi_cell(CONTENT_W, 6, text)
    pdf.ln(1)


def body(text, color=INK_DIM, size=10, gap=2):
    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "", size)
    pdf.set_text_color(*color)
    pdf.multi_cell(CONTENT_W, 5.4, text)
    pdf.ln(gap)


def bullet(text, marker_color=ACCENT):
    pdf.set_x(MARGIN)
    x0 = pdf.get_x()
    y0 = pdf.get_y()
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*marker_color)
    pdf.cell(5, 5.2, "·")
    pdf.set_xy(x0 + 5, y0)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*INK_DIM)
    pdf.multi_cell(CONTENT_W - 5, 5.2, text)
    pdf.ln(0.5)


def space(h=4):
    pdf.ln(h)


def need(h):
    """Page-break guard so blocks don't split awkwardly."""
    if pdf.get_y() + h > PAGE_H - 22:
        pdf.add_page()


def swatch_row(name, hexv, rgb, role, dot=False):
    """One color row: swatch chip + name/hex + role."""
    need(13)
    x = MARGIN
    y = pdf.get_y()
    # chip
    pdf.set_fill_color(*rgb)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.2)
    pdf.rect(x, y, 16, 11, "DF")
    # name + hex
    pdf.set_xy(x + 20, y)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(46, 5.5, name)
    pdf.set_xy(x + 20, y + 5.5)
    pdf.set_font("Courier", "", 9)
    pdf.set_text_color(*INK_DIM)
    pdf.cell(46, 5, hexv)
    # role
    pdf.set_xy(x + 70, y)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*INK_DIM)
    pdf.multi_cell(CONTENT_W - 70, 4.4, role)
    pdf.set_y(max(pdf.get_y(), y + 11) + 2.5)


def card(x, y, w, h, border=LINE, fill=SURFACE):
    pdf.set_fill_color(*fill)
    pdf.set_draw_color(*border)
    pdf.set_line_width(0.3)
    pdf.rect(x, y, w, h, "DF")


# ============================================================
# COVER
# ============================================================
pdf.add_page()

# scattered amber "city lights"
import random
random.seed(2026)
for _ in range(70):
    cx = random.uniform(10, PAGE_W - 10)
    cy = random.uniform(10, 150)
    r = random.uniform(0.3, 1.1)
    shade = random.choice([ACCENT, ACCENT, EMBER, (255, 243, 220)])
    pdf.set_fill_color(*shade)
    pdf.ellipse(cx, cy, r, r, "F")

# the one answer point + halo
acx, acy = PAGE_W / 2, 92
for rr, a in [(13, RAISE), (8, (60, 44, 22))]:
    pdf.set_fill_color(*a)
    pdf.ellipse(acx - rr, acy - rr, rr * 2, rr * 2, "F")
pdf.set_fill_color(*ACCENT)
pdf.ellipse(acx - 3.2, acy - 3.2, 6.4, 6.4, "F")

pdf.set_y(150)
pdf.set_font("Courier", "", 9)
pdf.set_text_color(*INK_DIM)
pdf.cell(0, 6, "D E L H I   ·   3 : 0 0   A M", align="C")
pdf.ln(16)

pdf.set_font("Helvetica", "B", 40)
pdf.set_text_color(*INK)
pdf.cell(0, 16, "OutsiderMap", align="C")
pdf.ln(20)

pdf.set_font("Helvetica", "", 22)
pdf.set_text_color(*INK)
pdf.cell(0, 10, "Ten thousand places.", align="C")
pdf.ln(11)
pdf.set_font("Helvetica", "BI", 22)
pdf.set_text_color(*ACCENT)
pdf.cell(0, 10, "One answer.", align="C")
pdf.ln(22)

pdf.set_font("Helvetica", "", 12)
pdf.set_text_color(*INK_DIM)
pdf.cell(0, 7, "Brand Book", align="C")
pdf.ln(7)
pdf.set_font("Courier", "", 8)
pdf.cell(0, 6, "YOUR CITY, YOUR TASTE   ·   2026", align="C")

# ============================================================
# 1. BRAND AT A GLANCE
# ============================================================
pdf.add_page()
voice("01 — Brand at a glance")
h2("The design", "is the brand.")
body(
    "OutsiderMap is hyper-personalized city discovery, Delhi first. Generic "
    "tools give you ten thousand options; OutsiderMap builds a personal taste "
    "profile and gives you the answer. The brand should always feel like the "
    "city at 3am: warm, low-lit, a little secret, and absolutely sure of itself."
)
space(2)
facts = [
    ("Name", "OutsiderMap — one word, capital O, capital M"),
    ("Promise", "Tell us your mood; we already know your taste; get the answer."),
    ("Primary line", "Ten thousand places. One answer."),
    ("Tagline", "Your city, your taste."),
    ("Home base", "Delhi  ·  \"Made for Delhi\""),
    ("Mode", "Dark-only. There is no light theme."),
    ("Feeling", "Cinematic, minimal, nocturnal, confident, a little underground."),
]
for k, v in facts:
    need(9)
    y = pdf.get_y()
    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*ACCENT)
    pdf.cell(34, 6, k)
    pdf.set_xy(MARGIN + 34, y)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*INK)
    pdf.multi_cell(CONTENT_W - 34, 6, v)
    pdf.ln(1.5)

space(4)
need(40)
voice("Brand story")
body(
    "People hit decision paralysis at the moment of intent. You know your mood "
    "(\"it's 3am and I want something\") but generic tools give you ten thousand "
    "options and none of them know you. OutsiderMap collapses those options into "
    "one confident, personal answer. Everything in the brand expresses that "
    "single move: many becomes one. The scattered city lights converging to a "
    "single bright point is not decoration; it is the product thesis, enacted."
)

# ============================================================
# 2. COLOR
# ============================================================
pdf.add_page()
voice("02 — Color")
h2("Delhi's", "night light.")
body(
    "The palette is derived from Delhi's actual night light: a warm amber-brown "
    "haze (never blue-black), streets lit by sodium-vapor lamps, neon reserved "
    "for the underground. Every value is a real CSS token in globals.css. "
    "Rule: never hardcode colors in components — use the tokens."
)
space(2)
voice("Core palette")
swatch_row("Night", "#0c0a08", NIGHT, "Primary background. Warm asphalt black; also the browser theme color.")
swatch_row("Surface", "#16120e", SURFACE, "Cards, panels, raised containers.")
swatch_row("Raise", "#1e1914", RAISE, "Highest elevation: chips, default badges, skeletons.")
swatch_row("Line", "#2b241c", LINE, "Borders, dividers, hairlines.")
swatch_row("Ink", "#ede7db", INK, "Primary text — warm paper-white, never pure white.")
swatch_row("Ink Dim", "#9b9183", INK_DIM, "Secondary text, captions, the muted system voice.")
space(3)
voice("Accent & signal")
swatch_row("Accent — Sodium Amber", "#f0a431", ACCENT, "The default voice of the brand. Primary actions, focus, the 'one answer' point, the logo dot.")
swatch_row("Ember", "#c87c1f", EMBER, "Deeper amber. Primary-button hover; secondary light in the hero field.")
swatch_row("Under — Neon Violet", "#b48aed", UNDER, "Reserved exclusively for underground / premium. Never ordinary UI.")
swatch_row("Danger", "#e0654f", DANGER, "Errors and destructive actions only.")

space(4)
need(40)
voice("The two-accent discipline")
body(
    "OutsiderMap runs on two accents with strict, separate jobs. Amber is the "
    "everyday brand color — free product, primary CTAs, the recurring "
    "sodium-lamp glow. Violet means underground / premium and nothing else. A "
    "violet halo, badge, or border is a promise that something is exclusive; "
    "spending it on a generic button breaks that promise and dilutes the "
    "conversion signal. When in doubt, it's amber."
)
space(1)
voice("Lighting motifs")
bullet(".halo — a soft radial sodium-lamp glow in amber (~14% accent). The recurring lighting motif behind heroes and CTAs.")
bullet(".halo-under — the same glow in violet (~12% under), only behind premium / underground sections.", UNDER)
bullet("::selection — text selection is amber at 30% opacity.")

# ============================================================
# 3. TYPOGRAPHY
# ============================================================
pdf.add_page()
voice("03 — Typography")
h2("Three voices,", "three jobs.")
body(
    "Three typefaces, each with a distinct job, wired as CSS variables in "
    "layout.tsx. (Specimens below are rendered in PDF substitute faces; the "
    "brand faces are named in each row.)"
)
space(2)

type_rows = [
    ("DISPLAY", "Fraunces", "Helvetica", "B",
     "Headlines, the wordmark, big editorial moments. Often italic for the punchline."),
    ("BODY", "Geist Sans", "Helvetica", "",
     "All running text, UI labels, paragraphs."),
    ("MONO", "Geist Mono", "Courier", "",
     "The 'system voice': eyebrows, timestamps, query input, metadata, fine print."),
]
for tag, face, sub, style, role in type_rows:
    need(26)
    y = pdf.get_y()
    card(MARGIN, y, CONTENT_W, 22)
    pdf.set_xy(MARGIN + 5, y + 3)
    pdf.set_font("Courier", "", 7.5)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 4, tag)
    pdf.set_xy(MARGIN + 5, y + 7)
    pdf.set_font(sub, style, 21)
    pdf.set_text_color(*INK)
    pdf.cell(0, 9, f"{face}  Ag")
    pdf.set_xy(MARGIN + 90, y + 7.5)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*INK_DIM)
    pdf.multi_cell(CONTENT_W - 95, 4.4, role)
    pdf.set_y(y + 22 + 4)

space(2)
need(40)
voice("The display signature")
body(
    "Headlines follow one rhythm: a statement in upright Fraunces, then the key "
    "phrase in italic amber (or italic violet in premium contexts). This "
    "'upright setup, italic payoff' is the most recognizable verbal pattern in "
    "the brand."
)
for setup, pay, col in [
    ("Ten thousand places.", "One answer.", ACCENT),
    ("A profile that gets you,", "then gets better.", ACCENT),
    ("The weekend, planned.", "The underground, open.", UNDER),
    ("The city already knows", "you're coming.", ACCENT),
]:
    need(9)
    pdf.set_x(MARGIN + 4)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(*INK)
    w = pdf.get_string_width(setup + " ")
    pdf.cell(w, 7, setup)
    pdf.set_font("Helvetica", "BI", 13)
    pdf.set_text_color(*col)
    pdf.cell(0, 7, pay)
    pdf.ln(8)

space(3)
need(30)
voice("The system voice  (.voice)")
body(
    "Small mono eyebrows and timestamps that frame content: mono, 0.6875rem, "
    "letter-spacing 0.3em, uppercase, color ink-dim. Examples: DELHI · 3:00 AM, "
    "RIGHT NOW MODE · FREE, WHEN YOU WANT MORE, MADE FOR DELHI. It always sits "
    "above a display headline and is always quiet — ink-dim, never accent."
)

# ============================================================
# 4. LOGO & ICON
# ============================================================
pdf.add_page()
voice("04 — Logo & icon")
h2("The one", "answer.")
body(
    "The app mark is the brand thesis in miniature: a rounded night-black tile "
    "with one bright amber circle at the optical center and a few faint amber "
    "points around it — ten thousand city lights collapsing to the single answer."
)
space(2)

# render the icon at three sizes
def draw_icon(x, y, size):
    r = size * 14 / 64
    pdf.set_fill_color(*NIGHT)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.2)
    pdf.rect(x, y, size, size, "DF")
    # faint field
    field = [(14, 18, 2.4, 0.55), (50, 14, 2.0, 0.4), (52, 46, 2.6, 0.5), (16, 48, 2.0, 0.45)]
    for fx, fy, fr, op in field:
        blend = tuple(int(ACCENT[i] * op + NIGHT[i] * (1 - op)) for i in range(3))
        pdf.set_fill_color(*blend)
        rr = fr * size / 64
        pdf.ellipse(x + fx * size / 64 - rr, y + fy * size / 64 - rr, rr * 2, rr * 2, "F")
    # answer
    cr = 9 * size / 64
    pdf.set_fill_color(*ACCENT)
    pdf.ellipse(x + size / 2 - cr, y + size / 2 - cr, cr * 2, cr * 2, "F")

iy = pdf.get_y()
draw_icon(MARGIN, iy, 36)
draw_icon(MARGIN + 44, iy + 12, 24)
draw_icon(MARGIN + 76, iy + 20, 16)
pdf.set_xy(MARGIN + 100, iy + 6)
pdf.set_font("Courier", "", 8)
pdf.set_text_color(*INK_DIM)
pdf.multi_cell(CONTENT_W - 100, 5,
    "Tile  64x64, radius 14, #0c0a08\nAnswer  central circle r=9, #f0a431\nField  4 dots, #f0a431 @ 40-55%")
pdf.set_y(iy + 40)

space(2)
voice("Construction rules")
bullet("The central amber dot is the answer — always brightest, always centered, never decorative.")
bullet("Surrounding lights are faint (<= 55% opacity) and few; they suggest a field without competing.")
bullet("The tile is night, not pure black, with a generous corner radius.")
space(2)
need(34)
voice("The wordmark")
body(
    "Set 'OutsiderMap' in Fraunces italic. One word, capital O and capital M, no "
    "space, no hyphen. In compact lockups it pairs with the system voice beneath "
    "it (wordmark + MADE FOR DELHI). The Open Graph image is the canonical hero "
    "lockup: night canvas, scattered amber lights, a glowing answer-point with a "
    "halo, the headline 'Ten thousand places. One answer.', and the kicker "
    "OUTSIDERMAP · DELHI in spaced uppercase ink-dim."
)
space(1)
voice("Don't")
bullet("Recolor the answer dot (always accent; violet only in an explicit premium lockup).", DANGER)
bullet("Add more than a sparse handful of background lights.", DANGER)
bullet("Set the wordmark upright/bold or in the body or mono faces — it is Fraunces italic.", DANGER)
bullet("Place the mark on a light background. The brand is dark-only.", DANGER)

# ============================================================
# 5. MOTION
# ============================================================
pdf.add_page()
voice("05 — Motion")
h2("A long,", "confident settle.")
body(
    "Motion is core to the brand — cinematic, minimal, motion-rich. One easing "
    "curve defines the feel: easeOutExpo = cubic-bezier(0.16, 1, 0.3, 1), also "
    "exposed as the --ease-out-expo token. Default transition duration is 0.8s."
)
space(2)
voice("Standard entrances")
rows = [
    ("fadeUp", "opacity 0->1, y 24->0", "The default reveal for almost everything."),
    ("fade", "opacity 0->1", "Subtle fades."),
    ("scaleIn", "opacity 0->1, scale 0.96->1", "Cards, focal elements."),
    ("stagger", "0.12s between children", "Grouped reveals (hero, lists)."),
    ("staggerSlow", "0.18s between children", "Full-section reveals."),
]
for name, beh, use in rows:
    need(8)
    y = pdf.get_y()
    pdf.set_x(MARGIN)
    pdf.set_font("Courier", "", 9)
    pdf.set_text_color(*ACCENT)
    pdf.cell(28, 5.6, name)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*INK)
    pdf.cell(50, 5.6, beh)
    pdf.set_text_color(*INK_DIM)
    pdf.cell(0, 5.6, use)
    pdf.ln(6.2)

space(3)
need(40)
voice("The signature scene — Convergence Field")
body(
    "The one hero 3D moment: a field of ~1,400 sodium-amber city lights drifts, "
    "then collapses into a single bright point (the answer), holds and breathes, "
    "then scatters again on a ~10.5s loop. Lights are mostly amber, some ember, "
    "a few warm-white, additively blended over night. Use it as the signature, "
    "not a background gimmick — one is enough."
)
space(1)
voice("Reduced motion is non-negotiable")
body(
    "prefers-reduced-motion is respected globally and per component: the "
    "Convergence Field renders as a static night-city scatter; the typing demo "
    "shows its final state instantly. Always honor it.", color=INK
)

# ============================================================
# 6. COMPONENTS
# ============================================================
pdf.add_page()
voice("06 — Components & UI language")
h2("Pills, cards,", "amber focus.")
body(
    "Shared traits across the design system: fully rounded pills for actions, "
    "soft rounded cards (--radius-card: 1.25rem), hairline 'line' borders, amber "
    "focus, generous dark space."
)
space(2)
voice("Buttons")
btns = [
    ("primary", ACCENT, NIGHT, "The main call to action. Amber on night; hover ember."),
    ("secondary", SURFACE, INK, "Transparent, line border. Secondary actions, 'Sign in'."),
    ("ghost", NIGHT, INK_DIM, "Tertiary / inline."),
    ("under", UNDER, NIGHT, "Premium / underground actions only."),
    ("danger", NIGHT, DANGER, "Destructive only."),
]
y = pdf.get_y()
bx = MARGIN
for label, bg, fg, _ in btns:
    w = pdf.get_string_width(label) + 12
    pdf.set_fill_color(*bg)
    if label in ("secondary", "ghost", "danger"):
        pdf.set_draw_color(*(LINE if label != "danger" else DANGER))
        pdf.set_line_width(0.3)
        pdf.rect(bx, y, w, 9, "DF")
    else:
        pdf.rect(bx, y, w, 9, "F")
    pdf.set_xy(bx, y)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*fg)
    pdf.cell(w, 9, label, align="C")
    bx += w + 5
pdf.set_y(y + 13)
for label, _, _, role in btns:
    need(6)
    pdf.set_x(MARGIN)
    pdf.set_font("Courier", "", 8.5)
    pdf.set_text_color(*ACCENT)
    pdf.cell(24, 5, label)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*INK_DIM)
    pdf.multi_cell(CONTENT_W - 24, 5, role)
    pdf.ln(0.5)

space(3)
need(36)
voice("Badges  ·  cards  ·  inputs")
bullet("Badges — small rounded-full tags: default (raise/ink-dim), accent (amber tint, e.g. 'matched to your profile'), under (violet, 'Premium'), outline.")
bullet("Cards — rounded-card, border line, bg surface, p-6. Premium cards switch the border to under/30.")
bullet("Inputs — rounded-xl, bg surface, border line, placeholder ink-dim/60, and an amber focus border.")
bullet("Focus — every focusable element gets a 2px amber focus-visible outline. Visible keyboard focus is a brand requirement.")
bullet("Spinner — a line ring with an amber top; skeletons pulse in raise.")

space(3)
need(34)
voice("The 'Right Now' surface pattern")
body(
    "The core interaction is a terminal-like exchange: a mono prompt with an "
    "amber > caret, the user's natural-language query typed in, then one answer "
    "card — name in display type, meta in ink-dim, a short bulleted 'why' with "
    "amber markers, and an amber 'matched to your profile' badge. Lead with the "
    "answer; justify it in two or three tight lines."
)

# ============================================================
# 7. VOICE & TONE
# ============================================================
pdf.add_page()
voice("07 — Voice & tone")
h2("Give the answer,", "then the reason.")
space(1)
voice("Do")
bullet("Give one answer, then the reason. ('Greasy enough to fix the night. Open when nothing else is.')")
bullet("Write for real, late, human moods — lowercase, unfiltered in user-voice examples.")
bullet("Use the upright -> italic-accent headline rhythm for big statements.")
bullet("Keep system framing in the quiet mono .voice.")
bullet("Lean nocturnal and a little secret for premium ('If it's on Google, it doesn't count').")
space(2)
voice("Don't")
bullet("Present a menu of ten options or hedge ('you could try...').", DANGER)
bullet("Sound like a corporate listings site or use generic hype.", DANGER)
bullet("Spend the violet / underground signal on ordinary copy.", DANGER)
bullet("Promise more cities loudly — it's 'Delhi first', 'more cities later'.", DANGER)

space(3)
need(60)
voice("Reference lines (canon)")
canon = [
    "Ten thousand places. One answer.",
    "Your city, your taste.",
    "Ask at 3am. Mean it.",
    "The weekend, planned. The underground, open.",
    "The city already knows you're coming.",
    "Made for Delhi.",
]
for line in canon:
    need(11)
    y = pdf.get_y()
    card(MARGIN, y, CONTENT_W, 9)
    pdf.set_xy(MARGIN + 4, y)
    pdf.set_font("Helvetica", "I", 11)
    pdf.set_text_color(*INK)
    pdf.cell(0, 9, line)
    pdf.set_y(y + 11)

# ============================================================
# 8. TOKEN REFERENCE
# ============================================================
pdf.add_page()
voice("08 — Quick reference")
h2("Design", "tokens.")
body("The @theme block in src/app/globals.css is canonical. Update this book whenever tokens, fonts, or signature components change.")
space(2)

tokens = [
    ("Color", [
        ("--color-night", "#0c0a08", "bg"),
        ("--color-surface", "#16120e", "cards"),
        ("--color-raise", "#1e1914", "chips, badges"),
        ("--color-line", "#2b241c", "borders"),
        ("--color-ink", "#ede7db", "text"),
        ("--color-ink-dim", "#9b9183", "muted text"),
        ("--color-accent", "#f0a431", "sodium amber — the brand"),
        ("--color-ember", "#c87c1f", "amber hover / depth"),
        ("--color-under", "#b48aed", "neon violet — premium only"),
        ("--color-danger", "#e0654f", "errors only"),
    ]),
    ("Type", [
        ("--font-display", "Fraunces", "headlines, wordmark (italic)"),
        ("--font-body", "Geist Sans", "everything"),
        ("--font-mono", "Geist Mono", "system voice, timestamps"),
    ]),
    ("Form", [
        ("--radius-card", "1.25rem", "card corner radius"),
        ("--ease-out-expo", "cubic-bezier(0.16,1,0.3,1)", "signature easing"),
    ]),
]
for group, items in tokens:
    need(10 + len(items) * 6)
    pdf.set_x(MARGIN)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 7, group)
    pdf.ln(8)
    for tok, val, role in items:
        pdf.set_x(MARGIN)
        pdf.set_font("Courier", "", 9)
        pdf.set_text_color(*INK)
        pdf.cell(52, 5.4, tok)
        pdf.set_text_color(*ACCENT)
        pdf.cell(54, 5.4, val)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*INK_DIM)
        pdf.cell(0, 5.4, role)
        pdf.ln(5.6)
    pdf.ln(3)

space(6)
pdf.set_x(MARGIN)
pdf.set_font("Helvetica", "I", 12)
pdf.set_text_color(*INK)
pdf.cell(0, 7, "Ten thousand places. ")
pdf.set_text_color(*ACCENT)
pdf.set_font("Helvetica", "BI", 12)
pdf.cell(0, 7, "One answer.")

pdf.output("/home/user/OutsiderMap/OutsiderMap-Brand-Book.pdf")
print("wrote OutsiderMap-Brand-Book.pdf")
