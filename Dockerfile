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
# Stage 2: Serve with Nginx
# ===========================================
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration (will be templated at deploy time)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script that templates nginx config before starting
COPY docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

EXPOSE 80

CMD ["/docker-entrypoint-custom.sh"]
