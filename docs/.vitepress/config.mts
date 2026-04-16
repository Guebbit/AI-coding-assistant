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
                { text: 'Endpoint Map', link: '/endpoint-map' },
                { text: 'Library Search', link: '/library-ingestion' },
                { text: 'Model Selection', link: '/model-selection' },
                { text: 'Ollama Models', link: '/infra/ollama-models' },
                { text: 'Ollama Notes', link: '/infra/ollama-notes' },
                { text: 'Packages', link: '/packages/' },
                { text: 'Theory', link: '/theory/agent-loop' },
                { text: 'Scenarios', link: '/scenarios' }
            ],
            sidebar: [
                {
                    text: 'Getting Started',
                    items: [
                        { text: 'Home', link: '/' },
                        { text: 'Use the Application', link: '/use-the-application' },
                        { text: 'Endpoint Map', link: '/endpoint-map' },
                        { text: 'Library Ingestion & Search', link: '/library-ingestion' },
                        { text: 'Scenarios & Tests', link: '/scenarios' },
                        { text: 'Ollama Models', link: '/infra/ollama-models' },
                        { text: 'Ollama Notes', link: '/infra/ollama-notes' },
                        { text: 'Modelfile Example', link: '/infra/modelfile-example' }
                    ]
                },
                {
                    text: 'Architecture',
                    items: [
                        { text: 'How It Works (Layered)', link: '/theory/how-it-works-layered' },
                        { text: 'Agent Loop Mental Model', link: '/theory/agent-loop' },
                        { text: 'Prompt, Context, Memory', link: '/theory/prompt-context-memory' },
                        {
                            text: 'Event-Driven Observability',
                            link: '/theory/events-observability'
                        },
                        { text: 'MCP Theory', link: '/theory/MCP' },
                        { text: 'Model Selection & Routing', link: '/model-selection' },
                        { text: 'RAG Theory', link: '/theory/RAG' },
                        { text: 'Vector Databases', link: '/theory/VECTOR_DATABASES' }
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
                }
            ],
            search: {
                provider: 'local'
            }
        }
    })
);
