FROM node:20-alpine

WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node src ./src

ENV NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "src/server.js"]
