# Theory: Prompt, Context, and Memory

The agent prompt is assembled from multiple blocks:

- **Task**: what user wants now
- **Memory**: recent useful outcomes from earlier runs
- **Context**: step-by-step outputs in current run
- **Tool list**: what actions are currently possible

## Practical interpretation

- Task gives direction
- Context gives local progress
- Memory gives short-term continuity plus semantic recall across tasks
- Tool list constrains action space

## Why memory is capped

Unbounded memory inflates prompts and hurts focus.

Current implementation uses a hybrid model:

- local ring buffer capped at 20 entries for recency
- Qdrant vector search for relevance using Ollama embeddings

## Prompt engineering choice

The model is forced to return one strict JSON object:

- `thought`
- `action`
- `input`

This reduces ambiguous outputs and simplifies runtime parsing.
