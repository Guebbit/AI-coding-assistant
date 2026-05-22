FROM node:22-alpine AS base

WORKDIR /app

ENV HUSKY=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci

COPY . .

# ── Development target (default) ─────────────────────────────────────────────
# Uses tsx watch mode — hot-reload on file changes (volume-mounted source).
FROM base AS dev
CMD ["npm", "run", "dev"]

# ── Production target ────────────────────────────────────────────────────────
# Runs migrations on startup, then starts the compiled server.
FROM base AS production
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
