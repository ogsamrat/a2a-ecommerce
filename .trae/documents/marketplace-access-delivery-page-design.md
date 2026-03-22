# Page Design Specification (Desktop-first)

## Global Styles (All Pages)
- Layout system: Flexbox for nav/rows; CSS Grid for listing/order card grids.
- Breakpoints: desktop ≥1200px (primary); tablet 768–1199px; mobile ≤767px.
- Design tokens:
  - Background: #0B1220; Surface: #111B2E; Border: rgba(255,255,255,0.08)
  - Text: #E8EEF9; Muted: #A7B3C8; Accent: #4F8CFF; Success: #2ECC71; Danger: #FF4D4F
  - Type scale: 14/16/20/28 (body/label/h2/h1)
  - Radius: 12px; Spacing: 8/12/16/24/32
- Buttons: primary (accent), secondary (surface), danger (red). Hover: +6% brightness; focus ring accent.
- Links: accent text with underline on hover.
- Sensitive data handling: credentials fields default masked with “Reveal” + “Copy” actions.

---

## 1) Marketplace (Home)
### Layout
- Two-column desktop: left filter sidebar (280px) + main results.
- Results in responsive grid: 3 columns desktop, 2 tablet, 1 mobile.

### Meta Information
- Title: “Marketplace – Digital Access”
- Description: “Browse digital accounts and services with post‑purchase access delivery.”
- OG: title + short description + default cover.

### Page Structure
1. Top navigation bar
2. Search + sort row
3. Filter sidebar
4. Listing results grid

### Sections & Components
- Nav bar: logo (left), search shortcut, links (Orders, Seller Dashboard), auth button/profile menu.
- Filters: category, delivery type, price range, seller score threshold.
- Listing card:
  - Title, price, delivery type badge
  - Seller name + score (if 0: show “New” label)
  - CTA: “View details”

---

## 2) Listing Details
### Layout
- Desktop split: main content (65%) + right purchase panel (35%, sticky).

### Meta Information
- Title: “{Listing Title} – Details”
- Description: first ~140 chars from listing description.
- OG: listing title + price + seller score.

### Page Structure
1. Breadcrumbs
2. Listing header (title, price, badges)
3. Tabs/sections: Overview, What you receive, Seller
4. Purchase panel

### Sections & Components
- What you receive: clear bullet list; delivery expectations (instant vs manual) and any constraints.
- Seller panel: seller name, score, review count; “New seller” when score=0.
- Purchase panel: price summary, quantity (optional), “Buy now” → Checkout.

---

## 3) Checkout
### Layout
- Centered single-column (max-width 760px) with summary card.

### Meta Information
- Title: “Checkout”
- Description: “Confirm purchase and place your order.”

### Page Structure
1. Order summary card
2. Buyer notes (optional)
3. Terms acknowledgement
4. Primary submit

### Sections & Components
- Summary: listing title, seller, price, delivery expectations.
- Terms: checkbox required; short policy text.
- Submit states: loading, success redirect to Orders/:orderId.

---

## 4) Orders & Access
### Layout
- Desktop: left orders list (360px) + right detail panel.

### Meta Information
- Title: “Your Orders”
- Description: “View purchases and access delivery details.”

### Page Structure
1. Orders list with status pills
2. Order detail header
3. Access delivery section
4. Feedback section

### Sections & Components
- Orders list item: listing title, date, status (Processing/Delivered).
- Access delivery:
  - Instructions block (rich text/markdown-lite)
  - Credential rows (label + masked value + Reveal + Copy)
  - Attachments (download links)
  - Timestamp “Delivered at …”
- Issue flag (MVP): “Not delivered/Invalid” toggle with textarea note.
- Feedback:
  - Rating (1–5), comment textarea
  - If within 15 minutes: “Edit” enabled
  - If within 60 minutes: “Undo” enabled (deletes/undone)
  - After lock: read-only with “Locked” label

---

## 5) Seller Dashboard
### Layout
- Desktop dashboard with top tabs: Listings / Orders / Reputation.

### Meta Information
- Title: “Seller Dashboard”
- Description: “Manage listings, deliver access, and track reputation.”

### Page Structure
- Listings tab: listing table + create/edit drawer
- Orders tab: order table + deliver action
- Reputation tab: score summary + feedback list

### Sections & Components
- Listings table: status (published/unpublished), price, score, actions.
- Listing editor: title, description, price, delivery type, expected delivery time.
- Delivery content:
  - Template instructions (what buyer sees)
  - Per-order delivery form (credentials JSON-like fields + attachments upload)
- Orders table: buyer anonymized id, order time, status, “Deliver” button.
- Reputation: show 0.0 + “New” if no reviews; otherwise avg + count; list feedback (active vs undone).

---

## 6) Auth (Login/Register)
### Layout
- Centered auth card with tabs (Login / Register) + reset password link.

### Meta Information
- Title: “Sign in”
- Description: “Access your account.”

### Sections & Components
- Login: email, password, submit.
- Register: email, password, display name.
- Reset: email field; confirmation state.
- Post-auth redirect back to last intended page (listing/checkout/orders).