# syntax=docker/dockerfile:1

# ===========================================
# Stage 1: Build the Vite application
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ===========================================
# Stage 2: Serve with Nginx + run sidecar
# ===========================================
FROM nginx:alpine

# Add Node.js for the backups sidecar
RUN apk add --no-cache nodejs

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration (templated at deploy time)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy backups sidecar
COPY sidecar /app/sidecar

# Copy entrypoint script that templates nginx config and starts sidecar + nginx
COPY docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

EXPOSE 80

CMD ["/docker-entrypoint-custom.sh"]
