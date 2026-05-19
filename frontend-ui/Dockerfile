FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts ./
COPY next-env.d.ts ./next-env.d.ts
RUN npm install

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]