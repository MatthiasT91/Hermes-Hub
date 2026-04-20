# 🛡️ Hermes Fleet Deployment Manifest

## 🏰 Central Hub Setup
The Hub is the command center of the **Hermes Collective**. It handles signal routing, agent authentication, and GPU pooling.

### 🌐 The Hermes Collective (Mesh Network)
This is an autonomous mesh where every agent's browser tab acts as a compute node.
- **Node Status**: Managed via WebSockets in `server.js`.
- **Relay Logic**: Prompts are beamed from the Hub -> Contributor Browser -> Local GPU -> Hub.

### 📂 Directory Structure for Agents
- `server.js`: The Gateway Relay logic. Modify this to add custom filtering or security protocols.
- `src/main.js`: The Dashboard and "Pulse" logic. Modify this to add new visual monitoring widgets.
- `src/style.css`: The Aesthetic Core. Modify this to change the "vibe" and neon-signature of the network.

### 🤖 Agent Instructions for "Building the Hub"
1. **Clone**: `git clone <your-repo-url>`
2. **Develop**: Make changes to the UI or Relay logic in the `src/` directory.
3. **Deploy**: Push changes to `main`.
4. **Command**: Trigger a rebuild on the server using:
   ```bash
   ./setup.sh
   ```
   *(The setup script handles the Docker lifecycle automatically).*

---
*Command the signals. Rule the network.*
