# 🧠 Ollama Custom Models — Setup & Usage Guide

## 📁 Directory Structure

```
.
├── docker-compose.yml
├── create-models.sh
└── modelfiles/
    └── <base_model[:tag]>/
        ├── Modelfile-<custom_name>
        └── ...
```

---

## ⚙️ How It Works

1. Each **subdirectory in `/modelfiles` = a base model**
    - Example: `llama3:8b`

2. Each file inside = a **custom variant**
    - Must follow naming:

        ```
        Modelfile-<custom_name>
        ```

3. On container startup:
    - Missing base models are **pulled**
    - Each Modelfile is used to **create a derived model**

---

## 🧩 Modelfile Example

```
FROM llama3

SYSTEM """
You are a concise and helpful assistant.
"""
```

Save as:

```
modelfiles/llama3:8b/Modelfile-assistant
```

---

## 🏷️ Naming Convention

Generated model name:

```
<base_name>-<tag>-<custom_name>
```

Example:

```
llama3-8b-assistant
```

---

## 🚀 Startup Flow

When `model-loader` runs:

1. Scan `/modelfiles`
2. For each base model:
    - Check if exists → otherwise `ollama pull`

3. For each Modelfile:
    - Run:

        ```
        ollama create <custom_model> -f <Modelfile>
        ```

---

## 🐳 Services Overview

### `ollama`

- Runs inference server
- GPU-enabled
- Stores models in:

    ```
    ~/.ollama
    ```

### `open-webui`

- Web interface → http://localhost:3000
- Connects to Ollama API

### `model-loader`

- One-shot container
- Builds all custom models at startup

---

## 📦 Volumes

| Volume            | Purpose              |
| ----------------- | -------------------- |
| `~/.ollama`       | Shared model storage |
| `ollama-data`     | Runtime/cache data   |
| `open-webui-data` | UI persistence       |

---

## ⚠️ Important Notes

- `~/.ollama` is **read-write** → avoid manual corruption
- Model creation runs **every container start**
- Duplicate model names will **overwrite silently**
- Ensure Modelfiles are valid before deploy

---

## ✅ Quick Add Workflow

1. Create directory:

    ```
    modelfiles/mistral:7b/
    ```

2. Add file:

    ```
    Modelfile-chat
    ```

3. Restart stack:

    ```
    docker compose up -d
    ```

4. Use model:

    ```
    mistral-7b-chat
    ```

---

## 🧪 Debug Tips

- List models:

    ```
    ollama list
    ```

- Check logs:

    ```
    docker logs model-loader
    ```

- Rebuild manually:

    ```
    ollama create <name> -f <Modelfile>
    ```

---

## 🎯 Best Practices

- Keep Modelfiles **small and focused**
- Use clear naming (`assistant`, `coder`, `rp`, etc.)
- Version base models (`llama3:8b`, not just `llama3`)
- Avoid heavy SYSTEM prompts → impacts performance

---

## 🔚 Summary

- Drop Modelfiles → restart → models auto-built
- Structure = **base model → variants**
- Fully automated via `model-loader`

---
