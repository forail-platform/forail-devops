# Forge AI Assistant — Ollama RAG Chat

Plan for an integrated AI assistant within the Forge platform that uses a local Ollama LLM with RAG (Retrieval Augmented Generation) for fast answers about the platform.

---

## Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Forge Web UI                          │
│                                                          │
│  ┌────────────────────────────────┐  ┌────────────────────┐ │
│  │     Dashboard / Jobs /         │  │   AI Assistant      │ │
│  │     Templates / Settings       │  │                     │ │
│  │                                │  │  User: How do I     │ │
│  │                                │  │  create a scheduled │ │
│  │                                │  │  job?               │ │
│  │                                │  │                     │ │
│  │                                │  │  Bot: To create a   │ │
│  │                                │  │  schedule, go to    │ │
│  │                                │  │  Templates > ...    │ │
│  │                                │  │                     │ │
│  │                                │  │  [____________] Ask │ │
│  └────────────────────────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌──────────────────┐         ┌───────────────────────┐
│   Forge API      │         │   AI Backend          │
│   (Django)       │         │   (Django endpoint)   │
│                  │         │                       │
│  /api/v2/...     │         │  /api/v2/assistant/   │
└──────────────────┘         └───────────┬───────────┘
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                         ┌────▼─────┐        ┌──────▼──────┐
                         │ ChromaDB │        │   Ollama    │
                         │ (Vector) │        │   (LLM)    │
                         │          │        │             │
                         │ AWX docs │        │ llama3.1:8b │
                         │ API help │        │ mistral:7b  │
                         │ Playbooks│        │ codellama   │
                         └──────────┘        └─────────────┘
```

---

## Key Features

| Feature                  | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| **Contextual help**      | Knows which page you're on, gives relevant tips      |
| **Documentation search** | Searches AWX/Forge docs, API reference, Ansible docs |
| **Error explanation**    | Explains errors from job output or API responses     |
| **Playbook assistance**  | Suggests Ansible modules, fixes YAML syntax          |
| **Admin guide**          | RBAC, credential setup, inventory management         |
| **Streaming responses**  | Token-by-token response display (SSE)                |

---

## Architecture

### Tech Stack

| Component      | Technology                           | Reason                                           |
| -------------- | ------------------------------------ | ------------------------------------------------ |
| **LLM**        | Ollama (llama3.1:8b or mistral:7b)   | Local, free, data privacy                        |
| **Vector DB**  | ChromaDB                             | Lightweight, Python native, no external service  |
| **Embeddings** | `nomic-embed-text` (Ollama)          | Local embedding model, fast                      |
| **Backend**    | Django endpoint (existing Forge API) | No new service, same auth                        |
| **Frontend**   | React chat component                 | Integrated into existing UI                      |
| **Streaming**  | Server-Sent Events (SSE)             | Simpler than WebSocket for unidirectional stream |

### Why Ollama + RAG?

1. **Privacy** — All data stays on the server, nothing goes to the cloud
2. **Free** — No API keys, no monthly costs
3. **Offline** — Works without internet
4. **Accuracy** — RAG ensures answers based on actual documentation
5. **Speed** — Local model on GPU gives a response in 2-5 seconds

---

## Phase 1: Ollama Setup and RAG Pipeline (Week 1)

### 1.1 Ollama Installation

```bash
# In Docker Compose — add Ollama service
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    # Fallback for CPU-only:
    # Without the GPU section, use a smaller model (tinyllama, phi3:mini)

  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - chroma_data:/chroma/chroma

volumes:
  ollama_data:
  chroma_data:
```

### 1.2 Model Selection

| Model            | RAM  | Speed   | Quality      | Recommendation              |
| ---------------- | ---- | ------- | ------------ | --------------------------- |
| `tinyllama:1.1b` | 2 GB | Fastest | Basic        | CPU-only, small server      |
| `phi3:mini`      | 4 GB | Fast    | Good         | CPU with 8GB+ RAM           |
| `mistral:7b`     | 6 GB | Medium  | Excellent    | GPU with 8GB+ VRAM          |
| `llama3.1:8b`    | 8 GB | Medium  | Best         | GPU with 10GB+ VRAM         |
| `codellama:7b`   | 6 GB | Medium  | Code-focused | For Ansible/YAML assistance |

Recommendation: **mistral:7b** for a balance of speed and quality. Fallback to **phi3:mini** for CPU-only.

```bash
# Pull models
ollama pull mistral:7b
ollama pull nomic-embed-text   # For RAG embeddings
```

### 1.3 RAG Document Pipeline

```python
# awx/main/management/commands/index_docs.py
# Django management command for indexing documentation

"""
Documents to index:
1. AWX API Reference (/api/v2/ — all endpoints with descriptions)
2. AWX User Guide (docs/ directory)
3. Ansible Module Index (most common modules)
4. Forge-specific documentation
5. Common error messages and solutions
6. RBAC model and permission explanations
"""

# Pipeline:
# 1. Load documents (Markdown, RST, HTML)
# 2. Split into chunks (500 tokens, 50 overlap)
# 3. Generate embeddings with nomic-embed-text
# 4. Save to ChromaDB collection
```

### 1.4 Document Sources

```
docs_to_index/
├── api_reference/          # Auto-generated from DRF schema
│   ├── jobs.md
│   ├── templates.md
│   ├── inventories.md
│   ├── credentials.md
│   ├── projects.md
│   ├── users.md
│   └── settings.md
├── user_guide/             # User instructions
│   ├── getting_started.md
│   ├── job_templates.md
│   ├── schedules.md
│   ├── workflows.md
│   ├── rbac.md
│   ├── notifications.md
│   └── troubleshooting.md
├── ansible/                # Ansible help
│   ├── common_modules.md
│   ├── playbook_syntax.md
│   ├── inventory_format.md
│   └── vault.md
└── errors/                 # Known errors and solutions
    ├── common_errors.md
    └── debug_guide.md
```

---

## Phase 2: Django Backend API (Week 1-2)

### 2.1 API Endpoint

```python
# awx/api/views/assistant.py

class AssistantView(APIView):
    """
    POST /api/v2/assistant/
    {
        "message": "How do I create a scheduled job?",
        "context": {
            "page": "/templates",
            "selected_id": 42
        }
    }

    Response (SSE stream):
    data: {"token": "To"}
    data: {"token": " create"}
    data: {"token": " a"}
    data: {"token": " scheduled"}
    data: {"token": " job"}
    data: {"token": ","}
    data: {"token": " navigate"}
    ...
    data: {"done": true, "sources": ["user_guide/schedules.md"]}
    """
```

### 2.2 RAG Query Flow

```python
# awx/main/services/assistant.py

class ForgeAssistant:
    def __init__(self):
        self.chroma = chromadb.HttpClient(host="chromadb", port=8000)
        self.collection = self.chroma.get_collection("forge_docs")
        self.ollama_url = "http://ollama:11434"

    def query(self, message: str, context: dict = None):
        # 1. Generate embedding for the question
        embedding = self._embed(message)

        # 2. Find relevant documents (top 5)
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=5
        )

        # 3. Compose prompt with context
        docs_context = "\n\n".join(results["documents"][0])

        system_prompt = f"""You are Forge Assistant, an AI helper for the Forge
infrastructure automation platform (based on AWX/Ansible Tower).

Answer questions using ONLY the following documentation context.
If you don't know the answer, say so — don't make things up.

Be concise and practical. Give step-by-step instructions when helpful.
If the user is on a specific page, tailor your answer to that context.

Documentation context:
{docs_context}"""

        # 4. Add page context if available
        if context and context.get("page"):
            system_prompt += f"\n\nUser is currently on page: {context['page']}"

        # 5. Stream response from Ollama
        yield from self._stream_chat(system_prompt, message)

    def _embed(self, text: str) -> list[float]:
        resp = requests.post(f"{self.ollama_url}/api/embeddings", json={
            "model": "nomic-embed-text",
            "prompt": text
        })
        return resp.json()["embedding"]

    def _stream_chat(self, system: str, message: str):
        resp = requests.post(
            f"{self.ollama_url}/api/chat",
            json={
                "model": "mistral:7b",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": message}
                ],
                "stream": True
            },
            stream=True
        )
        for line in resp.iter_lines():
            if line:
                data = json.loads(line)
                if not data.get("done"):
                    yield data["message"]["content"]
```

### 2.3 Django URL Config

```python
# awx/api/urls/assistant.py
urlpatterns = [
    path('assistant/', AssistantView.as_view(), name='assistant'),
    path('assistant/history/', AssistantHistoryView.as_view(), name='assistant-history'),
]
```

### 2.4 Chat History Model (Optional)

```python
# awx/main/models/assistant.py

class ChatMessage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=10)  # 'user' or 'assistant'
    content = models.TextField()
    sources = models.JSONField(default=list)
    page_context = models.CharField(max_length=255, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created']
```

---

## Phase 3: Frontend Chat Component (Week 2-3)

### 3.1 Chat Widget

```
┌──────────────────────────────────────────────┐
│ Forge Assistant                          ─ × │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ 🤖 Hi! I'm your Forge assistant.       │ │
│  │    Ask me anything about the platform.  │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ 👤 How do I create a job template       │ │
│  │    with survey variables?               │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ 🤖 To create a job template with        │ │
│  │    survey variables:                    │ │
│  │                                         │ │
│  │    1. Go to **Templates** > **Add**     │ │
│  │    2. Fill in name, project, playbook   │ │
│  │    3. Enable **Survey Enabled**         │ │
│  │    4. Click **Add Survey** to define    │ │
│  │       variables (text, password, etc)   │ │
│  │    5. Save the template                 │ │
│  │                                         │ │
│  │    📎 Source: user_guide/templates.md   │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ 🤖 ▊ (typing...)                       │ │
│  └─────────────────────────────────────────┘ │
│                                              │
├──────────────────────────────────────────────┤
│  ┌────────────────────────────────┐  ┌────┐ │
│  │ Ask anything...                │  │Send│ │
│  └────────────────────────────────┘  └────┘ │
└──────────────────────────────────────────────┘
```

### 3.2 Frontend Files

```
awx/ui_next/src/
├── components/
│   └── assistant/
│       ├── AssistantPanel.tsx      # Main chat panel (slide-in sidebar)
│       ├── ChatMessage.tsx         # Individual message (user/bot)
│       ├── ChatInput.tsx           # Input field + send button
│       └── AssistantButton.tsx     # Floating button to open
├── api/hooks/
│   └── useAssistant.ts            # SSE streaming hook
└── stores/
    └── assistant.ts               # Zustand store (history, open/close)
```

### 3.3 SSE Streaming Hook

```typescript
// useAssistant.ts
export function useAssistant() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  async function sendMessage(text: string, pageContext?: string) {
    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsStreaming(true);

    // Open SSE stream
    const response = await fetch("/api/v2/assistant/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, context: { page: pageContext } }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let botMessage = "";

    // Add empty bot message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      // Parse SSE data lines
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          if (data.token) {
            botMessage += data.token;
            // Update last message
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: botMessage,
              };
              return updated;
            });
          }
        }
      }
    }

    setIsStreaming(false);
  }

  return { messages, sendMessage, isStreaming };
}
```

---

## Phase 4: Documentation Indexing (Week 3)

### 4.1 Management Command

```bash
# Index all documents
awx-manage index_docs

# Re-index after an update
awx-manage index_docs --rebuild

# Test RAG search
awx-manage query_docs "how to create inventory"
```

### 4.2 Auto-generating API Documentation

```python
# awx/main/management/commands/generate_api_docs.py
# Iterates through all DRF ViewSets and generates Markdown documentation
# with endpoints, parameters, example request/response

# Result: docs_to_index/api_reference/*.md
```

### 4.3 Suggested Documents to Write

Priority 1 (most common questions):

- How to create a Job Template
- How to create an Inventory (manually, from a source)
- How to use Credentials
- How to set up a Schedule
- How RBAC works (Organizations, Teams, Roles)
- What is an Execution Environment

Priority 2:

- Workflow visual editor
- Notification templates
- Smart inventories
- Survey variables
- Webhook integration
- Troubleshooting FAQ

---

## Phase 5: Advanced Features (Week 3-4)

### 5.1 Contextual Hints

The assistant knows which page the user is on and gives relevant tips:

```
Page: /templates/job_template/new
→ "Need help creating a job template? I can explain each field."

Page: /jobs/42 (failed job)
→ "I see this job failed. Want me to analyze the error output?"

Page: /settings/authentication
→ "I can help you configure LDAP, SAML, or OAuth2 authentication."
```

### 5.2 Error Analysis

The user can send an error from the job output and get an explanation:

```
User: Job #42 failed with "No hosts matched"
Bot: This error means the inventory doesn't contain hosts matching
     your "limit" pattern. Check:
     1. Your inventory has hosts added
     2. The "Limit" field in the template matches actual host names
     3. Host patterns use correct syntax (e.g., "web*", "group1:&group2")
```

### 5.3 Ansible Playbook Helper

```
User: How do I copy a file to remote hosts?
Bot: Use the `ansible.builtin.copy` module:

     - name: Copy config file
       ansible.builtin.copy:
         src: files/app.conf
         dest: /etc/app/app.conf
         owner: root
         mode: '0644'
```

---

## Hardware Requirements

### Minimum (CPU-only, phi3:mini)

- CPU: 4 core
- RAM: 8 GB (4 for the model + 4 for everything else)
- Disk: 5 GB for the model + 2 GB for ChromaDB
- Response time: 10-20 seconds

### Recommended (GPU, mistral:7b)

- CPU: 4+ core
- RAM: 16 GB
- GPU: NVIDIA with 8+ GB VRAM (RTX 3060+, T4, A10)
- Disk: 10 GB for the model + 2 GB for ChromaDB
- Response time: 2-5 seconds

### Production (GPU, llama3.1:8b)

- CPU: 8+ core
- RAM: 32 GB
- GPU: NVIDIA with 12+ GB VRAM (RTX 4070+, A100)
- Disk: 15 GB for the model + 5 GB for ChromaDB
- Response time: 1-3 seconds

---

## Integration with Mobile Application

The chat will also be available in the Forge Mobile app:

```
Android:
- Same API endpoint (/api/v2/assistant/)
- Chat screen in bottom navigation
- Voice input (Android Speech-to-Text)
- Offline fallback: download FAQ locally
```

---

## Timeline

```
Week 1:    Ollama + ChromaDB setup, RAG pipeline, document indexing
Week 1-2:  Django backend API (SSE streaming, RAG query)
Week 2-3:  Frontend chat component (panel, streaming, markdown render)
Week 3:    Documentation — writing/generating docs for indexing
Week 3-4:  Advanced features (context hints, error analysis)
Week 4:    Testing, optimization, polish
```

**Total: ~4 weeks**

---

## MVP Priorities

Minimum viable product:

1. **Ollama service** in Docker Compose with mistral:7b
2. **ChromaDB** with indexed AWX documentation
3. **Django endpoint** /api/v2/assistant/ with SSE streaming
4. **Frontend chat panel** with send/receive and markdown rendering
5. **10-15 documents** indexed (API ref + user guide basics)

Post-MVP:

- Chat history (save conversations)
- Contextual hints per page
- Error analysis from job output
- Voice input in the mobile app
- Fine-tuning the model on Forge-specific data
- Multi-language support
