#!/bin/bash
# Setup whisper.cpp binary and model
set -e

WHISPER_DIR="$(dirname "$0")/../whisper"
MODELS_DIR="$WHISPER_DIR/models"
BIN_URL="https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/whisper-cli-x64-linux.tar.gz"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"

mkdir -p "$WHISPER_DIR" "$MODELS_DIR"

# Download whisper-cli binary
if [ ! -f "$WHISPER_DIR/whisper-cli" ]; then
  echo "Downloading whisper-cli binary..."
  curl -sL "$BIN_URL" | tar xz -C "$WHISPER_DIR" whisper-cli
  chmod +x "$WHISPER_DIR/whisper-cli"
  echo "whisper-cli ready"
else
  echo "whisper-cli already exists"
fi

# Download base model
if [ ! -f "$MODELS_DIR/ggml-base.bin" ]; then
  echo "Downloading ggml-base.bin model (~142MB)..."
  curl -sL "$MODEL_URL" -o "$MODELS_DIR/ggml-base.bin"
  echo "Model downloaded"
else
  echo "Model already exists"
fi

echo "Setup complete!"
ls -lh "$WHISPER_DIR/whisper-cli" "$MODELS_DIR/ggml-base.bin"
