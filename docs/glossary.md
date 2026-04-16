# Glossary

::: tip TL;DR
Quick-reference dictionary for every technical term used in these docs.
Each heading has an anchor — link from any page with `/glossary#term-slug`.
:::

## Agent Loop {#agent-loop}

The core execution cycle in Manna: **ask the model → parse its JSON decision → run a tool → feed the result back → repeat** until the model says "done" or the step limit is reached. Every `POST /run` request triggers one loop.

**See also:** [LLM](#llm), [JSON Contract](#json-contract), [Prompt](#prompt)

## ANN (Approximate Nearest Neighbour) {#ann}

A family of algorithms that find vectors "close enough" to a query vector **without** comparing every single one. Trading a tiny bit of accuracy for massive speed gains — like searching an index instead of reading every page of a book.

**See also:** [HNSW](#hnsw), [IVF](#ivf), [Vector Database](#vector)

## BM25 {#bm25}

A classic keyword-based search scoring algorithm (the one behind Elasticsearch). It counts exact word matches and weighs rare words higher. Fast and precise for literal queries, but won't understand synonyms.

**See also:** [Semantic Search](#semantic-search), [RAG](#rag)

## Chunk / Chunking {#chunk}

Splitting a large document into smaller, overlapping pieces so each one can be embedded and searched independently. Typical size: 300–800 tokens per chunk, with some overlap so context isn't lost at the edges.

**See also:** [Embedding](#embedding), [Token](#token)

## Context Window {#context-window}

The maximum amount of text (measured in tokens) a model can read in a single request. Think of it as the model's **working memory** — anything beyond the limit is simply invisible to it.

**See also:** [Token](#token), [Model Router](#model-router)

## Cosine Similarity {#cosine-similarity}

A math score (0 to 1) measuring how similar two vectors are by comparing their **direction**, not their magnitude. "How much do these two arrows point the same way?" A score near 1 means the texts are semantically close.

**See also:** [Vector Database](#vector), [Embedding](#embedding)

## CUDA {#cuda}

NVIDIA's GPU programming framework. If you want GPU-accelerated model inference (faster generation), you need an NVIDIA GPU and CUDA drivers installed.

**See also:** [VRAM](#vram), [Ollama](#ollama)

## Cypher {#cypher}

Neo4j's query language for graph databases — like SQL, but for nodes and relationships instead of rows and columns.

**See also:** [Neo4j](#neo4j), [Knowledge Graph](#knowledge-graph)

## Embedding / Embedding Model {#embedding}

Converting text into a fixed-length list of numbers (a **vector**) that captures its meaning. Texts with similar meanings get similar vectors. The **embedding model** is the model that performs this conversion — separate from the LLM that generates text.

**See also:** [Vector Database](#vector), [Cosine Similarity](#cosine-similarity), [Chunk](#chunk)

## Fail-Open {#fail-open}

A design pattern: if an optional service (Qdrant, Neo4j, MCP server) is down, the system **continues without it** instead of crashing. You lose the feature temporarily, but the agent still works.

**See also:** [Qdrant](#qdrant), [Knowledge Graph](#knowledge-graph)

## FIM (Fill-in-the-Middle) {#fim}

A code completion technique where the model receives text **before and after** the cursor, then fills the gap. More accurate than predict-next-token because it has context from both directions.

**See also:** [LLM](#llm)

## Fine-Tuning {#fine-tuning}

Retraining a pre-trained model on your own data to change its behavior, style, or domain knowledge. More expensive than RAG but the model **internalizes** the patterns instead of just reading them at query time.

**See also:** [LoRA](#lora), [RAG](#rag), [Weights](#weights)

## GraphRAG {#graphrag}

RAG enhanced with a knowledge graph. Combines vector similarity search with entity/relationship traversal, enabling **multi-hop reasoning** — "who worked on the same project as the author of X?"

**See also:** [RAG](#rag), [Knowledge Graph](#knowledge-graph), [Neo4j](#neo4j)

## HNSW (Hierarchical Navigable Small World) {#hnsw}

The most popular algorithm for fast approximate vector search. It builds a multi-layer graph: you start at the top (coarse) layer and navigate down to finer layers, zeroing in on the nearest vectors. Think of it like a skip list for high-dimensional space.

**See also:** [ANN](#ann), [IVF](#ivf), [Qdrant](#qdrant)

## IVF (Inverted File Index) {#ivf}

A vector search algorithm that groups vectors into clusters. At query time, only the **nearby clusters** are searched instead of the full dataset — trading a bit of recall for a big speed win.

**See also:** [ANN](#ann), [HNSW](#hnsw)

## JSON Contract / Structured Output {#json-contract}

The strict JSON format Manna's agent must return at every step: `{ thought, action, input }`. Validated by a Zod schema — if the model's output doesn't match, the step is retried with a correction hint.

**See also:** [Zod](#zod), [Agent Loop](#agent-loop)

## Knowledge Graph {#knowledge-graph}

A database of **entities** (people, concepts, technologies) and **relationships** between them, stored as a graph of nodes and edges. In Manna, powered by Neo4j and written to via the `knowledge_graph` tool.

**See also:** [Neo4j](#neo4j), [Cypher](#cypher), [GraphRAG](#graphrag)

## LangGraph {#langgraph}

A framework for building stateful, graph-based agent workflows with explicit nodes and edges. Manna's swarm orchestrator uses LangGraph to define the state machine: decompose → execute → review → synthesize.

**See also:** [State Machine](#state-machine), [Swarm](#swarm)

## LLM (Large Language Model) {#llm}

An AI model trained on massive text data that can generate and understand text. Examples: Llama, Qwen, GPT. In Manna, LLMs run locally through Ollama and make the decisions in the agent loop.

**See also:** [Ollama](#ollama), [Token](#token), [Context Window](#context-window)

## LoRA (Low-Rank Adaptation) {#lora}

A lightweight fine-tuning technique that bolts small trainable **adapter layers** onto a frozen model. You get most of the benefit of fine-tuning at a fraction of the VRAM and compute cost.

**See also:** [Fine-Tuning](#fine-tuning), [Weights](#weights), [VRAM](#vram)

## MCP (Model Context Protocol) {#mcp}

A standard protocol for AI apps to discover and call external tools. Think **USB for AI tools** — any MCP-compatible server can plug into any MCP-compatible client, no custom integration needed.

**See also:** [Agent Loop](#agent-loop)

## Model Profile {#model-profile}

In Manna, a routing category — `fast`, `reasoning`, `code`, or `default` — that determines **which model** handles a given step. The model router picks the profile; each profile maps to a configurable model name.

**See also:** [Model Router](#model-router)

## Model Router {#model-router}

The component that decides which model profile to use for each agent step. It considers task type, context size, and time budget. Can run in `rules` mode (keyword/heuristic) or `model` mode (asks a small LLM).

**See also:** [Model Profile](#model-profile), [Context Window](#context-window)

## NER (Named Entity Recognition) {#ner}

Extracting structured entities — people, organizations, dates, concepts — from unstructured text. In Manna, NER feeds entities into the knowledge graph.

**See also:** [Knowledge Graph](#knowledge-graph)

## Neo4j {#neo4j}

An open-source graph database that stores data as nodes and relationships. Manna uses it for the knowledge graph feature. Queries are written in Cypher.

**See also:** [Cypher](#cypher), [Knowledge Graph](#knowledge-graph), [GraphRAG](#graphrag)

## Ollama {#ollama}

A local model server that downloads and runs LLMs on your own machine. Manna uses Ollama as its backend — all inference happens on your hardware, nothing is sent to external APIs.

**See also:** [LLM](#llm), [VRAM](#vram), [CUDA](#cuda)

## Prompt {#prompt}

The full text sent to the LLM for each decision. In Manna, assembled from: the user's task + retrieved memory + tool context + the list of available tools + output format instructions.

**See also:** [Context Window](#context-window), [Agent Loop](#agent-loop)

## Pub/Sub (Publish-Subscribe) {#pub-sub}

A messaging pattern where senders (publishers) emit events and receivers (subscribers) listen for them. Components don't need to know about each other — they just agree on event names. Manna's event system follows this pattern.

**See also:** [SSE](#sse)

## Qdrant {#qdrant}

An open-source vector database used by Manna for semantic memory storage and similarity search. It stores embeddings and retrieves the most similar ones at query time using HNSW.

**See also:** [Vector Database](#vector), [HNSW](#hnsw), [Embedding](#embedding)

## Quantization {#quantization}

Compressing model weights to use fewer bits per number (e.g., Q4 = 4-bit, Q8 = 8-bit). Cuts VRAM usage roughly in proportion and speeds up inference, at a slight quality cost. Most local models are distributed pre-quantized.

**See also:** [Weights](#weights), [VRAM](#vram)

## RAG (Retrieval-Augmented Generation) {#rag}

A pattern: **search** a document store for relevant facts, then **feed** them to the LLM as context so it can answer questions about your data. The model generates; the retrieval keeps it grounded.

**See also:** [Embedding](#embedding), [Semantic Search](#semantic-search), [GraphRAG](#graphrag)

## Ring Buffer {#ring-buffer}

A fixed-size list where the oldest entry drops off when a new one is added. Like a conveyor belt of memories. In Manna, local (short-term) memory stores the last 20 agent interactions this way.

**See also:** [Agent Loop](#agent-loop)

## Semantic Search / Semantic Similarity {#semantic-search}

Finding content by **meaning** rather than exact keywords. "automobile" matches "car" because they mean the same thing. Powered by comparing embedding vectors.

**See also:** [Embedding](#embedding), [Cosine Similarity](#cosine-similarity), [BM25](#bm25)

## SSE (Server-Sent Events) {#sse}

A web standard for streaming real-time updates from server to client over a single HTTP connection. Used by Manna's `/run/stream` and `/run/swarm/stream` endpoints to push step-by-step progress.

**See also:** [Pub/Sub](#pub-sub)

## State Machine {#state-machine}

A system that moves through a set of defined **states** via **transitions**. Manna's swarm orchestrator is a LangGraph state machine with nodes: decompose → execute → review → synthesize.

**See also:** [LangGraph](#langgraph), [Swarm](#swarm)

## Swarm / Multi-Agent {#swarm}

Multiple AI agents working together on a complex task. One agent **decomposes** the task into subtasks, others solve them in parallel, and results are **merged** into a final answer. Triggered via `POST /run/swarm`.

**See also:** [State Machine](#state-machine), [LangGraph](#langgraph)

## Token {#token}

The basic unit models process text in. Not exactly a word — roughly **¾ of a word** on average. "hamburger" might become 3 tokens. Token counts determine context window limits and generation costs.

**See also:** [Context Window](#context-window), [Chunk](#chunk)

## Tool Reranker {#tool-reranker}

An optional component that re-orders the tool list by relevance to the current task **before** it's sent to the LLM. Helps the model pick the right tool when many are available. Fail-open — if it errors, the original list is used.

**See also:** [Agent Loop](#agent-loop), [Fail-Open](#fail-open)

## Vector / Vector Database {#vector}

A **vector** is a list of numbers representing a text's meaning (its embedding). A **vector database** (like Qdrant) stores millions of these and finds the most similar ones to a query vector in milliseconds using algorithms like HNSW.

**See also:** [Embedding](#embedding), [Qdrant](#qdrant), [HNSW](#hnsw), [Cosine Similarity](#cosine-similarity)

## VRAM {#vram}

Video RAM — the memory on your GPU. Larger models need more VRAM. A 7B-parameter model at Q4 quantization needs roughly 4–6 GB; a 70B model needs 40+ GB.

**See also:** [Quantization](#quantization), [CUDA](#cuda), [Ollama](#ollama)

## Weights {#weights}

The learned numerical parameters inside a model — billions of numbers that encode everything it learned during training. When you download a model file (`.gguf`), you're downloading its weights.

**See also:** [Quantization](#quantization), [Fine-Tuning](#fine-tuning), [LoRA](#lora)

## Zod {#zod}

A TypeScript-first schema validation library. Manna uses Zod to validate the agent's JSON output (`agentStepSchema`) at every step. If the output doesn't match, the step is retried with a correction prompt.

**See also:** [JSON Contract](#json-contract), [Agent Loop](#agent-loop)
