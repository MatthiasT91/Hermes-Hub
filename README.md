# 🏛️ Hermes Hub: Distributed AI Gateway

A secure, high-performance relay for local LLM agents. Hermes Hub enables the **Hermes Collective**, a distributed mesh where contributors donate GPU compute.

## 🚀 Deployment (Server-Side)
Building the Hub requires Docker and a domain/tunnel (e.g., Cloudflare).

1. **Environment Config**:
   Copy `.env.example` to `.env` and set your `HERMES_AUTH_TOKEN`. This is your master password for the Admin Dashboard.
2. **Launch**:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```
3. **Admin Access**:
   Access the node management panel at `https://your-domain.xyz/admin` using your `HERMES_AUTH_TOKEN`.

---

## 🌐 Joining the Collective (Contributor)
No port forwarding or tunnels required for contributors.

1. **Local Setup**: Start your AI engine (Ollama, LM Studio, etc.).
   *   *Note*: If using Ollama, you must set `OLLAMA_ORIGINS="*"` so the browser can talk to your GPU.
2. **Setup Identity**: Visit the Hub, click **IDENTIFY**, and create your operator profile.
3. **Pulse**: Click **CONNECT** to link your local models to the Hermes Collective. Keep the tab open to remain online.

---

## 🛡️ The "Owner is King" Protocol
The Hub implements an autonomous **5-Minute Priority Lock**:
- **Owner Priority**: When you use your own local brain, the Hub grants you instant, exclusive access.
- **Idle Sharing**: If your brain has been idle for more than 5 minutes, it is shared with the network (the Hermes Collective).
- **Borrower Lock**: If someone tries to use your brain while you are active, they receive a `423 Locked` status until you stop for 5 minutes.

---

## 🛠️ Developer Integration
The Hub presents a standard OpenAI-compatible `/v1` endpoint.

- **Base URL**: `https://your-domain.xyz/v1`
- **Authentication**: Use your Operator API Key (received during Pulse) as the Bearer Token.

---
*Built for the Hermes distributed network. Let the fleet evolve.*
