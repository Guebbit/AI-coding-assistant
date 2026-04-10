#!/usr/bin/env bash
# create-models.sh
#
# Runs inside the model-loader container.
# Waits for Ollama to be ready, then pulls the default model and creates
# any custom models defined in /modelfiles/*.Modelfile.
#
# Add custom Modelfiles to infra/podman/modelfiles/ — the file name (without
# the .Modelfile extension) becomes the model name.

set -euo pipefail

OLLAMA_HOST="${OLLAMA_HOST:-http://ollama:11434}"
MAX_RETRIES=30
RETRY_INTERVAL=5

# ── Wait for Ollama ──────────────────────────────────────────────────────────
echo "Waiting for Ollama at ${OLLAMA_HOST}…"

for i in $(seq 1 "$MAX_RETRIES"); do
  if curl -sf "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
    echo "Ollama is ready."
    break
  fi

  echo "Attempt ${i}/${MAX_RETRIES} — not ready yet; retrying in ${RETRY_INTERVAL}s…"
  sleep "$RETRY_INTERVAL"

  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "ERROR: Ollama did not become ready in time. Exiting."
    exit 1
  fi
done

# ── Pull the default model ───────────────────────────────────────────────────
DEFAULT_MODEL="${DEFAULT_MODEL:-llama3}"
echo "Pulling model: ${DEFAULT_MODEL}"
ollama pull "${DEFAULT_MODEL}"

# ── Create custom models from Modelfiles ─────────────────────────────────────
shopt -s nullglob
for modelfile in /modelfiles/*.Modelfile; do
  model_name="$(basename "${modelfile%.Modelfile}")"
  echo "Creating custom model: ${model_name} (from ${modelfile})"
  ollama create "${model_name}" -f "${modelfile}"
done
shopt -u nullglob

echo "Model setup complete."
