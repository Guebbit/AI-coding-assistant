# AI model-routing quick context

Canonical model documentation is in VitePress:

- `docs/model-selection.md`
- `docs/infra/ollama-models.md`

AI reminders:

- Supported profiles: `fast | reasoning | code`
- Router model env var: `AGENT_MODEL_ROUTER_MODEL`
- Profile resolution chain: `AGENT_MODEL_<PROFILE>` -> `OLLAMA_MODEL` -> error
- Do not assume hardcoded model names; check canonical docs and current env configuration.
