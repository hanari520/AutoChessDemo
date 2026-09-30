FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
