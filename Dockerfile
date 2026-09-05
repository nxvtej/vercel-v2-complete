# Stage 1: build dashboard UI
FROM node:20-bookworm AS frontend-build
WORKDIR /frontend
COPY vercel-v1-frontend/package*.json ./
RUN npm ci
COPY vercel-v1-frontend/ ./
RUN npm run build

# Stage 2: monolith server
FROM node:20-bookworm
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/ ./server/
COPY --from=frontend-build /frontend/dist ./server/public

ENV PORT=8080
ENV OUTPUT_DIR=/app/outputs
ENV WORK_DIR=/app/.builds

EXPOSE 8080
CMD ["node", "server/index.js"]
