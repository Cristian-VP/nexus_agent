FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY sql ./sql
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/sql ./sql

EXPOSE 4000
CMD ["node", "dist/index.js"]