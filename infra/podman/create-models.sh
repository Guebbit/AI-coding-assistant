#!/bin/bash
set -e

MODELS_DIR="/modelfiles"

echo "Processing models dynamically..."

# For every directory within MODELS_DIR, treat it as a base model, and for every Modelfile within that directory, create a customized model.
for base_dir in "$MODELS_DIR"/*; do
  [ -d "$base_dir" ] || continue

  base_model="$(basename "$base_dir")"
  base_name="$(echo "$base_model" | cut -d':' -f1)"
  base_tag="$(echo "$base_model" | cut -d':' -f2)"

  echo "Checking base model $base_model..."

  # If the model doesn't exist, pull it.
  if ! ollama list | grep -q "^$base_name"; then
    echo "Pulling $base_model..."
    ollama pull "$base_model"
  fi

  # Enter the the directory and create customized models based on Modelfiles within
  for modelfile in "$base_dir"/*; do
    [ -f "$modelfile" ] || continue

    customization="$(basename "$modelfile" | sed 's/Modelfile-//')"
    custom_model="${base_name}-${base_tag}-${customization}"

    echo "Creating $custom_model..."
    ollama create "$custom_model" -f "$modelfile"
  done
done

echo "All models processed."