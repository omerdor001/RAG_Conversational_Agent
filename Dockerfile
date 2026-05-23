FROM node:20-alpine

# curl is used in the entrypoint to wait on Ollama and pull models
RUN apk add --no-cache curl

WORKDIR /app

# Install all deps (devDeps needed for tsx at runtime to run seed script)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build-time public env vars — must be set at build time because Next.js
# bakes NEXT_PUBLIC_* into the client bundle during `next build`
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

# Entrypoint: waits for Ollama, pulls models, seeds data, starts app
RUN chmod +x docker/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker/entrypoint.sh"]
