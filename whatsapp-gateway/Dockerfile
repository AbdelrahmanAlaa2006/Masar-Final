# Dockerfile — for any VPS / Railway / Fly.io / self-hosted Docker.
FROM node:20-slim

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# WhatsApp sessions live on a mounted volume so links survive restarts.
ENV SESSIONS_DIR=/data
VOLUME /data

# Supabase keys are passed at runtime as environment variables (never baked in).
ENV PORT=8790
EXPOSE 8790

CMD ["npm", "start"]
