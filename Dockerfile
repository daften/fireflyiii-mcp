# Stage 1: build
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --ignore-scripts: skip the `prepare` git-hook script (simple-git-hooks); it is a
# dev-only concern and has no .git directory to operate on inside the image.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Stage 2: runtime
FROM node:24-alpine AS runtime
WORKDIR /app
COPY package*.json ./
# --ignore-scripts: prod install omits dev deps, so the `prepare` script
# (simple-git-hooks devDependency) is absent; skip lifecycle scripts entirely.
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/.well-known/oauth-authorization-server || exit 1
CMD ["node", "dist/index.js", "--transport", "http", "--host", "0.0.0.0"]
