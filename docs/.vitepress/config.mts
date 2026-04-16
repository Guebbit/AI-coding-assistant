import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
    defineConfig({
        title: 'AI Coding Assistant Docs',
        description: 'Practical and theory-driven docs for the local-first agent system',
        cleanUrls: true,
        themeConfig: {
            nav: [
                { text: 'Home', link: '/' },
                { text: 'Getting Started', link: '/use-the-application' },
                { text: 'Packages', link: '/packages/' },
                { text: 'Theory', link: '/theory/how-it-works-layered' },
                { text: 'Examples', link: '/examples/' },
                { text: 'Scenarios', link: '/scenarios/' },
                { text: 'API', link: '/endpoint-map' },
                { text: 'Glossary', link: '/glossary' }
            ],
            sidebar: [
                {
                    text: 'Getting Started',
                    items: [
                        { text: 'Home', link: '/' },
                        { text: 'Use the Application', link: '/use-the-application' },
                        { text: 'Endpoint Map', link: '/endpoint-map' },
                        { text: 'Library Ingestion & Search', link: '/library-ingestion' },
                        { text: 'Model Selection & Routing', link: '/model-selection' }
                    ]
                },
                {
                    text: 'Infrastructure',
                    collapsed: true,
                    items: [
                        { text: 'Ollama Setup & Reference', link: '/infra/ollama-notes' },
                        { text: 'Ollama Models', link: '/infra/ollama-models' },
                        { text: 'Modelfile Example', link: '/infra/modelfile-example' }
                    ]
                },
                {
                    text: 'Architecture & Theory',
                    items: [
                        { text: 'How It Works (Layered)', link: '/theory/how-it-works-layered' },
                        { text: 'Agent Loop Mental Model', link: '/theory/agent-loop' },
                        { text: 'Prompt, Context, Memory', link: '/theory/prompt-context-memory' },
                        {
                            text: 'Event-Driven Observability',
                            link: '/theory/events-observability'
                        },
                        { text: 'MCP Theory', link: '/theory/MCP' },
                        { text: 'RAG Theory', link: '/theory/RAG' },
                        { text: 'Vector Databases', link: '/theory/VECTOR_DATABASES' },
                        { text: 'LoRA & Fine-Tuning (Theory)', link: '/theory/lora-fine-tuning' },
                        { text: 'LoRA & Fine-Tuning (Practical)', link: '/theory/lora-practical' }
                    ]
                },
                {
                    text: 'Practical Examples',
                    collapsed: true,
                    items: [
                        { text: 'Overview', link: '/examples/' },
                        { text: 'Read & Answer', link: '/examples/read-and-answer' },
                        { text: 'Code Analysis', link: '/examples/code-analysis' },
                        { text: 'Database Query', link: '/examples/database-query' },
                        { text: 'Web Scraping', link: '/examples/web-scraping' },
                        { text: 'Semantic Memory', link: '/examples/semantic-memory' },
                        { text: 'Swarm Orchestration', link: '/examples/swarm-orchestration' },
                        { text: 'MCP Integration', link: '/examples/mcp-integration' },
                        { text: 'Knowledge Graph', link: '/examples/knowledge-graph' },
                        { text: 'Streaming Events', link: '/examples/streaming-events' },
                        { text: 'Model Routing', link: '/examples/model-routing' }
                    ]
                },
                {
                    text: 'Scenarios (Hands-on)',
                    collapsed: true,
                    items: [
                        { text: 'Overview', link: '/scenarios/' },
                        { text: '1. File Reading', link: '/scenarios/file-reading' },
                        { text: '2. Shell Inspection', link: '/scenarios/shell-inspection' },
                        {
                            text: '3. Multi-step Reasoning',
                            link: '/scenarios/multi-step-reasoning'
                        },
                        { text: '4. SQL Query', link: '/scenarios/sql-query' },
                        { text: '5. Browser Fetch', link: '/scenarios/browser-fetch' },
                        { text: '5.1 Vision', link: '/scenarios/vision-classification' },
                        { text: '5.2 Speech', link: '/scenarios/speech-transcription' },
                        { text: '5.3 PDF Reading', link: '/scenarios/pdf-reading' },
                        { text: '5.4 Semantic Search', link: '/scenarios/semantic-search' },
                        { text: '6. Tool Boundary', link: '/scenarios/tool-boundary' },
                        { text: '7. Architecture', link: '/scenarios/architecture-understanding' },
                        { text: '8. Missing Tool', link: '/scenarios/missing-tool' },
                        { text: '9. Write File', link: '/scenarios/write-file' },
                        { text: '10. Scaffold Project', link: '/scenarios/scaffold-project' }
                    ]
                },
                {
                    text: 'Package Reference',
                    items: [
                        { text: 'Overview', link: '/packages/' },
                        { text: 'agent — The Brain', link: '/packages/agent' },
                        { text: 'orchestrator — LangGraph Swarm', link: '/packages/orchestrator' },
                        { text: 'llm — Model Connection', link: '/packages/llm' },
                        { text: 'memory — Short-term Storage', link: '/packages/memory' },
                        { text: 'mcp — MCP Bridge', link: '/packages/mcp' },
                        { text: 'graph — Knowledge Graph', link: '/packages/graph' },
                        { text: 'events — Notifications', link: '/packages/events' },
                        {
                            text: 'tools — Toolbox',
                            items: [
                                { text: 'Overview', link: '/packages/tools/' },
                                {
                                    text: 'Database Adapters',
                                    link: '/packages/tools/db-adapters'
                                },
                                { text: 'mysql_query', link: '/packages/tools/mysql-query' },
                                { text: 'pg_query', link: '/packages/tools/pg-query' },
                                { text: 'mongo_query', link: '/packages/tools/mongo-query' },
                                { text: 'read_file', link: '/packages/tools/read-file' },
                                { text: 'shell', link: '/packages/tools/shell' },
                                { text: 'browser_fetch', link: '/packages/tools/browser-fetch' },
                                { text: 'image_classify', link: '/packages/tools/image-classify' },
                                {
                                    text: 'semantic_search',
                                    link: '/packages/tools/semantic-search'
                                },
                                { text: 'speech_to_text', link: '/packages/tools/speech-to-text' },
                                { text: 'read_pdf', link: '/packages/tools/read-pdf' },
                                {
                                    text: 'code_autocomplete',
                                    link: '/packages/tools/code-autocomplete'
                                },
                                { text: 'write_file', link: '/packages/tools/write-file' },
                                {
                                    text: 'scaffold_project',
                                    link: '/packages/tools/scaffold-project'
                                }
                            ]
                        }
                    ]
                },
                {
                    text: 'Reference',
                    items: [{ text: '📖 Glossary', link: '/glossary' }]
                }
            ],
            search: {
                provider: 'local'
            }
        }
    })
);
