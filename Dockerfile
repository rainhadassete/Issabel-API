# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

# ---- Runtime Stage ----
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies: ffmpeg + curl (for model download)
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY src/ ./src/
COPY package.json ./

# Setup whisper.cpp binary and model
RUN mkdir -p /app/whisper/models && \
    curl -sL "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-ubuntu-x64.tar.gz" \
    | tar xz --strip-components=1 -C /app/whisper/ && \
    chmod +x /app/whisper/whisper-cli && \
    curl -sL "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" \
    -o /app/whisper/models/ggml-small.bin

# Environment variables for whisper
ENV WHISPER_BIN=/app/whisper/whisper-cli
ENV WHISPER_MODELS_DIR=/app/whisper/models
ENV WHISPER_MODEL=ggml-small.bin
ENV LD_LIBRARY_PATH=/app/whisper

# Expose API port
EXPOSE 3030

# Create tmp directory with proper permissions
RUN mkdir -p /app/tmp && chown appuser:appgroup /app/tmp

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3030/api/health || exit 1

CMD ["node", "src/index.js"]
