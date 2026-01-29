# Use the official Bun image
FROM oven/bun:1.2-alpine as base

WORKDIR /app

# Copy everything so future src/ additions and manifests are included
COPY . .

# Install dependencies when a manifest exists (noop today, future friendly)
RUN if [ -f package.json ]; then bun install --production; fi

# Environment Defaults
ENV PORT=3000
ENV GAMES_DIRS=/games

EXPOSE 3000

CMD ["bun", "start"]