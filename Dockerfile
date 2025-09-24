# Multi-stage build for Next.js frontend and Python backend
FROM node:20-bullseye-slim AS frontend-builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY . .

# Build the Next.js application
RUN pnpm build

# Production stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    bash \
    ca-certificates \
    gnupg \
    graphviz \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the built Next.js application from frontend-builder
COPY --from=frontend-builder /app/.next ./.next
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/package*.json ./
COPY --from=frontend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/next.config.mjs ./
COPY --from=frontend-builder /app/tsconfig.json ./
COPY --from=frontend-builder /app/postcss.config.mjs ./

# Copy only necessary files for production
COPY api/ ./api/
COPY examples/ ./examples/

# Copy startup script
COPY docker-start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose only the main port (backend is internal)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHONPATH=/app

# Start the application
CMD ["/app/start.sh"]
