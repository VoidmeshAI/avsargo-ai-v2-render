FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force
COPY . .
EXPOSE 3000
CMD ["node", "bootstrap.mjs"]
