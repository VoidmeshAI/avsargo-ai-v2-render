FROM node:24-bookworm-slim AS node24
FROM mcr.microsoft.com/playwright:v1.64.0-noble
COPY --from=node24 /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && node -e "require('node:sqlite')" && chown -R pwuser:pwuser /app
COPY --chown=pwuser:pwuser . .
ENV NODE_ENV=production
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
