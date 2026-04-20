# 🛡️ Hermes Fleet Deployment Manifest

## 🏰 Central Hub Setup
This project is designed to be the "Brain" of the network. Agents are encouraged to build onto this.

### 📂 Directory Structure for Agents
- `server.js`: The Gateway Relay logic. Modify this to add custom filtering or security.
- `src/main.js`: The Dashboard logic. Modify this to add new visual monitoring widgets.
- `src/style.css`: The Aesthetic Core. Modify this to change the "vibe" of the network.

### 🤖 Agent Instructions for "Building the Hub"
1. **Clone**: `git clone <your-repo-url>`
2. **Develop**: Make changes to the UI or Relay logic.
3. **Deploy**: Push to `main`.
4. **Command**: Trigger a rebuild on the Proxmox server using:
   ```bash
   ssh <server-ip> "cd /path/to/hermes && git pull && docker compose up -d --build"
   ```

---
*Command the signals. Rule the network.*
