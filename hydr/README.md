# HYDR-U

**HYDR-U** is a conversational commerce platform for HYDR, a fictional Indian skincare brand. Rather than a traditional product-grid storefront, the entire customer experience — browsing, cart, wishlist, saved addresses, checkout, payment, and order tracking — happens through a single AI shopping assistant chat interface.

The project also demonstrates **agent-to-agent commerce**: a public product feed and an ACP-style (Agentic Commerce Protocol) checkout API that let external AI buying agents (e.g. ChatGPT plugins, third-party shopping bots) browse and purchase from HYDR programmatically, alongside the in-app assistant.

## Key Features

- **Conversational storefront (HYDR-U)** — An LLM-powered shopping assistant (via Groq) that can search products, compare items, manage cart/wishlist, save delivery addresses, place orders, and track shipments, all through natural language. Tool calls are the only way the assistant can read or mutate data — it never invents product info, prices, or order status.
- **Typo-tolerant product search** — Postgres `pg_trgm` fuzzy search handles misspelled or shorthand queries (e.g. "hyularonic serm").
- **Two commerce surfaces, one backend**
  - *In-app agent*: authenticated chat checkout for logged-in customers.
  - *External agent API*: an API-key-gated, ACP-style `create_checkout` → `update_checkout` → `complete_checkout` flow for third-party buying agents, plus a public unauthenticated `/api/feed` catalog endpoint.
- **Payments** — Razorpay integration (test mode) for order payment, including raw-body webhook signature verification.
- **Fraud detection** — Lightweight rule-based scoring (abnormal quantities, scripted-looking orders, order velocity) that flags suspicious orders for admin review without blocking checkout.
- **Admin dashboard** — Revenue and order metrics split by order source (web, in-app agent, external agent), order/fraud/returns review queues, and management of external agent API clients.
- **Append-only audit log** — Every meaningful action (cart changes, orders, fraud flags, admin decisions) is recorded and never updated or deleted.
- **Server-enforced guardrails** — Hard ceilings (e.g. max quantity per add, max order value) enforced in code, not just requested via the LLM prompt, so the assistant can't be talked into bypassing them.

## A video of the working project 


## Tech Stack

| Layer      | Technology                                                   |
|------------|--------------------------------------------------------------|
| Frontend   | React 18, React Router, Vite                                 |
| Backend    | Node.js (ESM), Express                                       |
| Database   | PostgreSQL (with `pgcrypto`, `pg_trgm` extensions)           |
| Auth       | JWT (cookie-based sessions), bcrypt                          |
| AI / LLM   | Groq API (Llama 3.3 70B by default), function/tool calling   |
| Payments   | Razorpay (test mode)                                         |
| Validation | Zod                                                          |

## Project Structure

hydr/
├── backend/
│ ├── src/
│ │ ├── db/ # Schema, migrations, seed data, connection pool
│ │ ├── middleware/ # Auth, error handling, rate limiting, external agent auth
│ │ ├── routes/ # REST endpoints (auth, products, cart, orders, chat, admin, ...)
│ │ └── services/ # Business logic (commerce, agent/LLM orchestration, fraud, audit, Razorpay)
│ └── .env.example
├── frontend/
│ ├── src/
│ │ ├── api/ # API client
│ │ ├── components/ # UI components, including chat widgets
│ │ ├── context/ # Auth context
│ │ └── pages/ # Auth, Chat, Admin pages
│ └── .env.example
└── scripts/
└── mock-external-agent.js # Simulates a third-party buying agent over HTTP


## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- A [Groq API key](https://console.groq.com) (free tier available)
- Razorpay **test mode** API keys ([dashboard](https://dashboard.razorpay.com))

## Getting Started

### 1. Clone and configure environment variables

```bash
cd backend
cp .env.example .env
# edit .env with your DATABASE_URL, JWT_SECRET, GROQ_API_KEY, Razorpay keys, etc.

cd ../frontend
cp .env.example .env
# edit .env if your API base or Razorpay key differs from the defaults
```

### 2. Set up the database

```bash
cd backend
npm install
npm run migrate    # creates tables/extensions from schema.sql
npm run seed        # seeds demo products, users, an admin account, and a demo external-agent API key
```

The seed script prints the admin login and a demo external-agent API key — save the API key, as it is only shown once.

### 3. Run the backend

```bash
cd backend
npm run dev          # starts the API on PORT (default 4000) with file watching
```

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev          # starts Vite dev server (default http://localhost:5173)
```

Visit `http://localhost:5173` to use HYDR-U. Log in with the admin credentials from the seed step to access `/admin`.

### 5. Try the external buying agent demo

In a separate terminal, simulate a third-party AI agent buying from HYDR over HTTP, using only the public feed and the agent-checkout API:

```bash
cd backend
HYDR_API_KEY=<key printed during seed> npm run mock-agent
```

## API Overview

| Area                  | Base path              | Notes                                                        |
|------------------------|------------------------|----------------------------------------------------------------|
| Auth                   | `/api/auth`            | Signup, login, session cookie                                  |
| Products               | `/api/products`        | Catalog browsing                                                |
| Cart / Wishlist        | `/api/cart`, `/api/wishlist` | Authenticated customer state                    
                         |
| Addresses              | `/api/addresses`       | Saved delivery addresses                                        |
| Orders                 | `/api/orders`          | Order placement, tracking, Razorpay webhook                  |
| Chat                   | `/api/chat`            | In-app AI shopping assistant (HYDR-U)                            |
| Public feed            | `/api/feed`            | Unauthenticated JSON product catalog for external agents         |
| Agent checkout           | `/api/agent-checkout`  | ACP-style `create_checkout` / `update_checkout` / `complete_checkout`, requires `x-api-key` |
| Admin                    | `/api/admin`           | Dashboard, order/fraud/returns management, requires admin role   |

Health check: `GET /api/health`

## Security Notes

- Passwords are hashed with bcrypt; sessions use signed JWTs in HTTP-only cookies.
- The Razorpay webhook route is mounted with a raw body parser (before the global JSON parser) so its HMAC signature can be verified correctly.
- External agent endpoints require a valid `x-api-key`, have a stricter rate limit than in-app routes, and are re-priced server-side on every step — nothing from the calling agent is trusted for price, stock, or coupon validity.
- The audit log is append-only by design; in production, revoke `UPDATE`/`DELETE` privileges on `audit_log` for the application's database role.
- The LLM assistant's tool set is the *only* way it can read or write data — server-side limits (max quantity per add, max order value) are enforced in code independent of the model's own behavior.

## License

Released under the MIT Licence.

## Acknowledgements

Built for the Razorpay Buildathon - Track 01: AI Growth & Agentic Commerce.