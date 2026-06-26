# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies
COPY package*.json ./
RUN npm ci --frozen-lockfile --omit=dev

# Copy built artifacts and static public files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared

# Non-root user for security
RUN addgroup -S viona && adduser -S viona -G viona
USER viona

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.js"]
