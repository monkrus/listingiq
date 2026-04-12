FROM node:22-alpine AS base
# sharp requires these native libs on Alpine
RUN apk add --no-cache vips-dev

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Skip sharp during npm ci (lockfile has Windows binaries that fail on Alpine).
# Then install sharp separately with correct platform flags.
RUN npm ci --ignore-scripts && npm install --os=linux --libc=musl --cpu=x64 sharp

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js needs these at build time for NEXT_PUBLIC_ vars
ARG NEXT_PUBLIC_USE_MOCK_API
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_USE_MOCK_API=$NEXT_PUBLIC_USE_MOCK_API
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Dummy value so build doesn't fail — real key is injected at runtime
ENV ANTHROPIC_API_KEY=build-placeholder
ENV STRIPE_SECRET_KEY=build-placeholder
ENV STRIPE_WEBHOOK_SECRET=build-placeholder

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
