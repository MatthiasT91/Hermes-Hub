#!/bin/bash
# 🏛️ Hermes Hub - Ubuntu "Elite" Setup Script

echo "🌌 Initializing Hermes Hub Deployment..."

# 1. Update & Install Docker if missing
if ! command -v docker &> /dev/null
then
    echo "📦 Installing Docker Engine..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    
    echo \
      "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# 2. Build and Launch
echo "🚀 Building Hermes Hub Container..."
sudo docker compose up -d --build

echo "✅ Hermes Hub is now screaming into the void at http://localhost:8080"
echo "📡 Check your Proxmox IP to access from your network."
