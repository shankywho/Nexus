FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc* ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
# Next.js bakes rewrites at build time, so the API address is a build argument.
ARG NEXUS_API_URL=http://api:8000
ENV NEXUS_API_URL=${NEXUS_API_URL} NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
