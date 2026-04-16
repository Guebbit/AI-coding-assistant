# Practical Examples

::: tip TL;DR
Real-world request → under-the-hood walkthrough → expected response. Pick any example.
:::

Each example shows a complete request-to-response flow. You'll see the exact `curl` command, what the agent does internally (step by step with events), and what comes back.

Every example is **fake but realistic** — the requests, event logs, and responses are fabricated to demonstrate real Manna behaviour without requiring a running instance.

---

## Basic Agent

| Example                             | What it shows                                      |
| ----------------------------------- | -------------------------------------------------- |
| [Read & Answer](read-and-answer.md) | Simplest possible flow — one tool call, one answer |
| [Code Analysis](code-analysis.md)   | Multi-file reasoning across a 4-step agent loop    |

## Data & Search

| Example                               | What it shows                                        |
| ------------------------------------- | ---------------------------------------------------- |
| [Database Query](database-query.md)   | SQL tool with safety boundary (SELECT only)          |
| [Web Scraping](web-scraping.md)       | Fetch a page, summarise it, see truncation behaviour |
| [Semantic Memory](semantic-memory.md) | Two sequential runs — cold vs warm (memory hit)      |

## Multi-Agent

| Example                                       | What it shows                                                    |
| --------------------------------------------- | ---------------------------------------------------------------- |
| [Swarm Orchestration](swarm-orchestration.md) | Decompose → execute → review → synthesize with parallel subtasks |

## Integrations

| Example                                  | What it shows                                       |
| ---------------------------------------- | --------------------------------------------------- |
| [MCP Tools (GitHub)](mcp-integration.md) | External tool discovery, namespacing, and execution |
| [Knowledge Graph](knowledge-graph.md)    | Multi-hop entity traversal via Neo4j                |

## Streaming & Monitoring

| Example                                     | What it shows                                    |
| ------------------------------------------- | ------------------------------------------------ |
| [Streaming Events](streaming-events.md)     | SSE event stream vs standard response            |
| [Model Routing in Action](model-routing.md) | How the router picks different profiles per task |

---

## How to read these examples

Each example follows the same template:

1. **The Request** — exact `curl` command you'd run
2. **What Happens Under the Hood** — step-by-step with a Mermaid sequence diagram and event logs
3. **The Response** — the JSON you get back
4. **Key Takeaway** — one-liner insight

> **ADHD tip**: pick whichever example matches what you're building. You don't need to read them in order.
