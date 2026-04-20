# 🏛️ Hermes Hub Deployment & Development

## 🚀 Deployment to Ubuntu (Proxmox LXC/VM)
Using Docker on Ubuntu is the **gold standard** for this dashboard. It ensures your agents can't "break" the host OS.

1. **Get the Code**: Transfer this folder to your Ubuntu server (via Git, SFTP, or SCP).
2. **Launch**:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```
3. **Connectivity**: Your Local Hermes Agent should now use this as its API URL:
   `https://hermes.localmodels.xyz/v1`

---

## 🤖 Agent Customization "Building the Hub"
Your agents can absolutely build onto this. Because we used **Vite** and **Vanilla JS**, it’s extremely easy for AI to understand and modify.

### How agents should work on this:
1. **File Access**: Ensure your agents have read/write access to this directory.
2. **Modular Components**: Agents should create new `.js` files in `src/` for new features and import them into `main.js`.
3. **Visual Iteration**: They can modify `style.css` to add new "Neon" glows or change the layout.
4. **Tool Access**: Give your agents a tool that lets them run `npm run build` or `docker compose restart` after they make changes.

### Ideas for Agents to build:
- **Metrics Module**: An agent can add a dashboard section showing token usage/latency.
- **Auto-Discovery**: An agent can write a script to auto-scan your network for new Cloudflare tunnels and add them to `localStorage`.
- **Theme Switcher**: An agent can add a "Cosmic/Alchemist" toggle to change the visual vibe dynamically.

---
*Hermes Hub is built to be an evolving organism. Let your fleet take the reins.*
