# OutsiderMap — Investor Narrative

> **We own the deciding.** One AI that learns your taste, understands your
> moment, and gives you *the* answer — a real, often hidden place you'll
> actually love — then plans the day around it.
>
> Delhi NCR first. Then every corner of India.
>
> _Living document. Figures current as of July 2026; sources at the foot._

---

## 1. The problem — decision paralysis at the moment of intent

Deciding where to go in your own city means bouncing between **Google Maps,
Instagram, WhatsApp, Reddit, YouTube, and friends** — and *still* second-guessing
the choice. Every tool optimizes for **comprehensiveness**: ten thousand options,
none of which know *you*. The result is overwhelm, defaulting to the same three
places, or staying home. In a new city it's worse — you have zero local context
and fall straight into the tourist-trap chains.

Nobody makes the **decision**. That's the job we take.

---

## 2. The insight — catalogs tell you what exists; we tell you where *you* should go

Every incumbent is a **catalog**. We are a **personalization engine with a
proprietary supply of real places.** Three things make that real:

1. **It knows you.** A behavioral *taste graph* built from what you actually do —
   every ask, save, skip, and visit — not a one-time form. It sharpens every tap.
2. **It knows the *real* city.** A user-sourced catalog of **hidden and
   underrated spots**, with chains and tourist-defaults *structurally demoted*.
   Popularity is a **penalty** in our ranking, the inverse of every other app.
3. **It plans, not just lists.** A companion, quests, and a map — the answer
   *and* the day built around it, at 3pm or 3am.

> Catalogs answer "what's near me." We answer "where should *I* go tonight."

---

## 3. Why the incumbent structurally *cannot* copy us

The sharp question is *"District/Zomato are adding AI recommendations too — why
can't they just be you?"* The answer is **incentive alignment**, not technology:

- **They make money when you go to the venue that pays them** — booking fees, ad
  placements, promoted listings. They can *never* truly demote a chain or surface
  the free ₹30 hidden dhaba, because **the franchise is their customer.** Their
  catalog is optimized for the venue's ad budget.
- **We are optimized for the user's taste.** Our rewards flow to the *member* and
  the *scout* who surfaced the spot — so our incentive is to be *right for you*,
  not to route you to the highest bidder.

Our anti-chain, hidden-first bias isn't a feature they forgot to build — it's a
thing their business model **forbids**. That's the moat.

**And the moat compounds as data, not code.** "AI" is table stakes in 2026; what
is defensible is the **data the AI runs on that no one else has**:

- **A per-user behavioral taste graph** — grows with every interaction, can't be
  bought, can't be back-filled.
- **A proprietary supply of off-Google hidden spots** — contributed by our own
  members, unmonetizable (and therefore invisible) to a chain-driven incumbent.

---

## 4. The market — the pond is deep

| Layer | Size | Source |
|---|---|---|
| **India food services (TAM)** | **~$78–85B (2025) → $120–152B (2030)** | Swiggy–Kearney, IBEF, Mordor |
| **Online "going-out" / dining-out (SAM)** | **~$600M (2023), growing 46–53%/yr** → multi-$B by 2028; pre-booking growing **7× faster than walk-ins** | Swiggy IPO / Redseer |
| **Beachhead (SOM)** | **Delhi NCR** going-out + hyperlocal spend — a top-2 metro by discretionary spend | — |

TAM is not the risk. Category execution is.

---

## 5. Business model — monetize the transaction, never the answer

- **Free, forever:** the taste profile + the one confident answer. The
  habit-forming hook is never paywalled.
- **The engine — rewards / transactions:** members route real spend through us to
  earn rewards; we take a blended margin (rewards spread + merchant fees + listing
  / ads). This is also our **richest data moat** — a *transaction* ("she actually
  went and paid, this place, this night") is a 10× stronger signal than a tap, and
  it lets us *prove ROI to merchants* who then fund the rewards. The flywheel:

  ```
  rewards → members route real spend → transaction data
    → recommendations get genuinely better  (moat)
    → we prove ROI to the merchant
    → merchant funds the reward → funds growth → repeat
  ```

- **Scout economy:** submit a hidden spot; when members go, you earn a small
  share (reward on *verified transaction*, not check-in — fraud-resistant by
  design). Cheap supply + a community flywheel.
- **Premium (later):** access & belonging — curated experiences and people/events
  you can't get otherwise. Scarcity, not "more recommendations."

**Comp that proves the model:** **Magicpin** (hyperlocal discovery + rewards) did
**~₹870 cr (~$105M) revenue in FY24, 3× growth**, with EBITDA margin improving
from **−39% to −10%** — a real, near-profitable business on exactly this engine.

---

## 6. What we've already built

A live, disciplined product — not a prototype:

- **Taste profiling** (onboarding + continuous behavioral learning; append-only
  interaction log from day one) with **pgvector** taste↔place matching.
- **The one-answer engine** — natural-language intent → ranked pick → streamed,
  personal "why," with chains hard-filtered and an **obviousness penalty** in
  ranking.
- **Map** front door, **chat**, **quests** (guided, gamified day-plans),
  **reels** (member-badged, UGC virality), **friends** (social graph), curated
  **experiences**, and an **admin curation + data-ingestion pipeline**.
- **Engineering hygiene** rare this early: RLS default-deny, provider-agnostic AI
  layer, idempotent seeding, CI, security-definer game integrity. Seeded catalog
  for Delhi; multi-city roadmap wired.

---

## 7. Traction plan — the gates to institutional money

We measure the thing that decides everything: **retention**, plus our own north
star — **Confident-Answer-Accept-Rate** (did you act on the one answer?).

| Gate | Prove this | Then raise |
|---|---|---|
| **Now (pre-seed)** | Live product + differentiated thesis + founder | on you + the prototype |
| **Seed** | Live in **Delhi NCR**, **5–20K users**, healthy **D30 retention** (20–30%+), first proof the **rewards loop drives real transactions** | on a working loop |
| **Series A** | Multi-city, meaningful **monthly GMV run-rate**, cohorts that **flatten**, unit economics (LTV:CAC > 3, payback < 18–24 mo) | on a scalable machine |

---

## 8. The ask & what to expect

Raising a **pre-seed** to prove Delhi NCR retention and the rewards loop over
**~12–18 months**, reaching the institutional-seed gate.

| Stage | Timing | Raise | Valuation (post) | Dilution |
|---|---|---|---|---|
| **Pre-seed** | now | **$0.2–0.6M** (₹1.7–5 cr) | $2–5M | 10–15% |
| **Seed** | +9–18 mo (on retention proof) | **$1–3M** (₹8–25 cr) | $6–15M | 15–20% |
| **Series A** | +12–24 mo (on GMV + monetization) | **$5–15M** | $30–67M | ~20% |

**How the four numbers actually relate — read this before any meeting:**

- **Investment** funds the gap between now and profit; it tracks *milestones*,
  not revenue.
- **Valuation** at seed is *mostly disconnected from revenue* — it's team +
  retention + wedge. Consumer is priced on engagement/GMV, not a revenue multiple.
- **Revenue** = GMV × take-rate, and it *lags users by 12–24 months* because we
  deliberately don't monetize the free hook.
- **Profit** is the *last* thing to arrive. Magicpin, a decade in and $100M+ in
  revenue, is only now near breakeven — and that is *normal and fine*. Investors
  buy the retention curve, not early profit.

> Investment funds the gap to profit. Valuation is a bet on your retention curve.
> Revenue follows GMV, which follows habit. Profit comes last — after you own the
> habit.

---

## 9. Honest risks (priced in)

- **Category has a graveyard.** India social-commerce raised ~$2.6B and most died
  (Trell, Roposo, Bulbul, Simsim). **Mitigation:** lead with the *transactions +
  rewards* muscle (a real business, per Magicpin); treat social/reels as a
  *retention feature*, not the business.
- **A profitable, funded incumbent exists** (District, 800 cities, dining-out
  already profitable at $500M+ GOV). **Mitigation:** the incentive moat in §3 —
  the one thing their model forbids.
- **Cold-start / content density** is the #1 operational risk. **Mitigation:** the
  scout economy + ingestion pipeline turn members into supply.
- **Everything rides on retention.** If Delhi NCR cohorts flatten above category
  norm, the raise is easy. If they don't, no TAM slide saves us. We instrument it
  from day one.

---

### Sources

India food services / going-out: [Swiggy–Kearney $125B by 2030](https://india.entrepreneur.com/news-and-trends/swiggy-kearney-report-projects-125-billion-food-market/500233),
[IBEF $144–152B by 2030](https://www.ibef.org/news/indian-food-services-market-projected-to-hit-us-144-152-bn-by-2030-report),
[The CapTable — District vs Dineout](https://the-captable.com/2025/04/swiggy-dineout-scenes-zomato-district-catchup/).
District: [Q1 FY26 revenue +118%](https://voice.lapaas.com/district-app-revenue-up-118-percent-q1/).
Magicpin: [FY24 revenue & margins](https://en.channeliam.com/2025/02/15/magicpin-revenue-growth-fy24/),
[funding](https://www.clay.com/dossier/magicpin-funding).
Funding climate & benchmarks: [India funding $11B, selective (TechCrunch)](https://techcrunch.com/2025/12/27/india-startup-funding-hits-11b-in-2025-as-investors-grow-more-selective/),
[India seed benchmarks (RaiseIQ)](https://raiseiq.in/blog/seed-valuation-benchmarks-india/),
[Series A benchmarks (Startups.com)](https://www.startups.com/lexicon/series-a-funding).
Category risk: [2025 startup graveyard (Inc42)](https://inc42.com/features/25-indian-startups-shut-down-in-2025/).
