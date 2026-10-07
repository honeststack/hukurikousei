# 本番用イメージ（PostgreSQL は DATABASE_URL で外部に用意する）
FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# 起動時にマイグレーションを適用してから起動する
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
