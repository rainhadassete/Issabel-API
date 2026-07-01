# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

# ---- Runtime Stage ----
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies: ffmpeg + curl (for model download)
RUN apk add --no-cache ffmpeg curl bash

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY src/ ./src/
COPY package.json ./

# Setup whisper.cpp binary and model
RUN mkdir -p /app/whisper/models && \
    curl -sL "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-cli-x64-linux.tar.gz" \
    | tar xz -C /app/whisper/ whisper-cli && \
    chmod +x /app/whisper/whisper-cli && \
    curl -sL "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" \
    -o /app/whisper/models/ggml-base.bin

# Environment variables for whisper
ENV WHISPER_BIN=/app/whisper/whisper-cli
ENV WHISPER_MODELS_DIR=/app/whisper/models
ENV WHISPER_MODEL=ggml-base.bin

# Expose API port
EXPOSE 3000

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
