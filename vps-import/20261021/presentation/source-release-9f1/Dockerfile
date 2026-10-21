FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm test && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-impress poppler-utils fonts-liberation2 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server-dist ./server-dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets
COPY --from=build /app/public ./public
COPY --from=build /app/samples ./samples
COPY --from=build /app/scripts/qa-local.mjs ./scripts/qa-local.mjs
COPY --from=build /app/scripts/qa-phase9a.mjs ./scripts/qa-phase9a.mjs
COPY --from=build /app/scripts/qa-beta-integration.mjs ./scripts/qa-beta-integration.mjs
COPY --from=build /app/scripts/qa-pak-arie-live.mjs ./scripts/qa-pak-arie-live.mjs
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 DATA_DIR=/app/data
EXPOSE 4310
CMD ["node","server-dist/server/index.js"]
