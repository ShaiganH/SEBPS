# ── Stage 1: Build ───────────────────────────────────────────────────────────
# Uses Node only to produce the static dist/ folder.
# This entire stage is thrown away after the build — none of node_modules ends
# up in the final image.
FROM node:22-alpine AS builder

WORKDIR /app

# Install deps first — layer-cached unless package.json changes
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
# Nginx alpine is ~25 MB. Copies only the compiled dist/ output from Stage 1.
# No Node, no node_modules, no source code in the final image.
FROM nginx:alpine

# Copy built static files
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config — listens on 5173 (matches existing docker-compose port mapping),
# proxies /api/ and /ws/ to the backend service.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx placeholder (our config replaces it)
RUN rm -f /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
