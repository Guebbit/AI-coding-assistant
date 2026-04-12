# Theory: Agent Loop Mental Model

Think of the system as a controlled reasoning loop:

1. Build prompt from task + memory + context + tools
2. Route the step to a model profile
3. Ask selected model for strict JSON decision
4. Execute tool if needed
5. Append result to context
6. Repeat until done or step limit

## Why this works

- The model does planning
- Tools do deterministic execution
- Context turns previous outputs into next-step inputs

## Why max 5 steps matters

- Prevents runaway loops
- Caps cost and latency
- Forces concise planning behavior

## Failure modes (normal)

- Invalid JSON from model
- Unknown tool request
- Tool runtime errors

The loop is built to recover and continue when possible.
