#!/bin/bash
# 🏛️ Hermes Hub - Ubuntu "Elite" Setup Script

echo "🌌 Initializing Hermes Hub Deployment..."

# 1. Ensure .env exists
if [ ! -f .env ]; then
    echo "📄 Creating .env from template..."
    cp .env.example .env
fi

# 2. Update & Install Docker if missing
if ! command -v docker &> /dev/null
then
    echo "📦 Installing Docker Engine..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# 3. Build and Launch
echo "🚀 Building Hermes Hub Container..."
sudo docker compose up -d --build

# 4. Success Signal
SOURCE_DOMAIN=$(grep NETWORK_DOMAIN .env | cut -d '=' -f2)
DOMAIN=${SOURCE_DOMAIN:-"http://localhost:8080"}

echo ""
echo "✅ Hermes Hub is now screaming into the void at $DOMAIN"
echo "🧠 Point your Hermes Agent to $DOMAIN/v1"
echo "📡 Access the Command Center in your browser."
