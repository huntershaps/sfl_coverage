# --- deps: install with the native toolchain available -----------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles a native addon, so the build stage needs python/make.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

# --- build -------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime -----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/sfi.db

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home sfi

# The standalone bundle plus the two asset trees it does not inline.
COPY --from=build --chown=sfi:sfi /app/.next/standalone ./
COPY --from=build --chown=sfi:sfi /app/.next/static ./.next/static
COPY --from=build --chown=sfi:sfi /app/public ./public

# better-sqlite3's compiled addon is traced into the standalone bundle by the
# build above — verified at .next/standalone/node_modules/better-sqlite3/build/
# Release/better_sqlite3.node — so no extra copy is needed. Build and runtime
# share a base image, which is what keeps that prebuilt binary loadable.

# The database lives on a mounted volume, never inside the image.
RUN mkdir -p /data && chown sfi:sfi /data
VOLUME ["/data"]

USER sfi
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
