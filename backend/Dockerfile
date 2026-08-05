FROM node:20.10.0-alpine AS base
WORKDIR /app

# ── deps: install once, reused by build ─────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# ── build: compile TS + generate the Prisma client ──────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── runtime: production image ────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

RUN apk add --no-cache curl \
  && addgroup -S app && adduser -S app -G app

# IMPORTANT: copy node_modules from the `build` stage, not `deps`.
# `deps` predates `npx prisma generate`, so it does not contain the
# generated Prisma client/query engine — using it here would make every
# database call fail at runtime with "did you forget to run prisma generate?"
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh ./

RUN chmod +x ./docker-entrypoint.sh && chown -R app:app /app
USER app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fs http://localhost:4000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/app.js"]