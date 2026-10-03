# syntax=docker/dockerfile:1

# ─── base ─────────────────────────────────────────────────────────────────────
# pnpm on the PATH and one workdir. The runtime keeps it too: migrations run
# through `pnpm migration:run:prod` on deploy.

FROM node:24-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

# ─── deps ─────────────────────────────────────────────────────────────────────
# Manifests only, so editing source does not invalidate the install layer. No
# BuildKit cache mount: `docker build` must work without the buildx plugin.

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

# ─── build ────────────────────────────────────────────────────────────────────
# Compile TypeScript into dist/.

FROM deps AS build

COPY . .

RUN pnpm build

# ─── runtime ──────────────────────────────────────────────────────────────────
# Production dependencies and dist/ only — no source, no dev tooling, which is
# also why `pino-pretty` can never be reached from here.

FROM base AS runtime

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

# AWS RDS CA bundle — lets DATABASE_SSL_CA_PATH=/app/certs/rds-combined-ca-bundle.pem
# verify the server certificate. Public, ~200 KB, changes rarely.
RUN mkdir -p /app/certs && chown node:node /app/certs
ADD --chown=node:node --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-combined-ca-bundle.pem

USER node

EXPOSE 4000

# Liveness only. Point orchestrators at /api/health/ready as well — readiness checks
# the database, and a failing one must not restart the container.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
