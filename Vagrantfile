# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"
  config.vm.hostname = "forge-deploy"

  # Production deployment ports
  config.vm.network "forwarded_port", guest: 80,   host: 8080   # HTTP
  config.vm.network "forwarded_port", guest: 443,  host: 8443   # HTTPS
  config.vm.network "forwarded_port", guest: 8013, host: 8013   # Forge web internal

  config.vm.network "private_network", ip: "192.168.56.22"

  config.vm.provider "virtualbox" do |vb|
    vb.name = "forge-deploy"
    vb.memory = "8192"
    vb.cpus = 4
  end

  config.vm.provider "libvirt" do |lv|
    lv.memory = 8192
    lv.cpus = 4
  end

  config.vm.synced_folder ".", "/forge-deploy", type: "rsync",
    rsync__exclude: [".git/", "*.pyc", "__pycache__/"]

  config.vm.provision "shell", inline: <<-SHELL
    set -euo pipefail

    echo "============================================"
    echo " Forge Deploy - Ubuntu 24.04"
    echo " Provisioning..."
    echo "============================================"

    export DEBIAN_FRONTEND=noninteractive

    # --- System packages ---
    echo "[1/3] Installing system packages..."
    apt-get update
    apt-get install -y \
        git curl wget gnupg lsb-release ca-certificates \
        openssl apache2-utils

    # --- Docker ---
    echo "[2/3] Installing Docker..."
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com | sh
    fi
    systemctl enable docker --now
    usermod -aG docker vagrant

    apt-get install -y docker-compose-plugin 2>/dev/null || true

    if ! command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\\K[^"]+')
        curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
            -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi

    # --- SSL self-signed certs for testing ---
    echo "[3/3] Generating self-signed SSL certificates..."
    mkdir -p /forge-deploy/nginx/ssl
    if [ ! -f /forge-deploy/nginx/ssl/fullchain.pem ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /forge-deploy/nginx/ssl/privkey.pem \
            -out /forge-deploy/nginx/ssl/fullchain.pem \
            -subj "/C=RS/ST=Belgrade/L=Belgrade/O=Forge Platform/CN=forge.local"
    fi

    # --- .env file ---
    if [ ! -f /forge-deploy/.env ]; then
        SECRET_KEY=$(openssl rand -hex 32)
        WS_SECRET=$(openssl rand -hex 32)
        DB_PASS=$(openssl rand -hex 16)
        ADMIN_PASS=$(openssl rand -base64 12)

        cat > /forge-deploy/.env << ENVFILE
POSTGRES_USER=forge
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=forge
FORGE_SECRET_KEY=${SECRET_KEY}
FORGE_BROADCAST_WEBSOCKET_SECRET=${WS_SECRET}
FORGE_ADMIN_USER=admin
FORGE_ADMIN_PASSWORD=${ADMIN_PASS}
FORGE_ADMIN_EMAIL=admin@forge.local
FORGE_ALLOWED_HOSTS=*
FORGE_CSRF_TRUSTED_ORIGINS=https://192.168.56.22,https://localhost:8443,https://forge.local
FORGE_NODE_NAME=forge-node
FORGE_NODE_TYPE=hybrid
FORGE_IMAGE=ghcr.io/forgeplatform/forge-backend
FORGE_TAG=latest
ENVFILE
        echo "Generated .env with random secrets."
        echo "Admin password: ${ADMIN_PASS}"
    fi

    # --- Workspace setup ---
    ln -sf /forge-deploy /home/vagrant/forge-deploy

    cat >> /home/vagrant/.bashrc << 'BASHRC'

# Forge Deploy Environment
export FORGE_DEPLOY=/forge-deploy
alias forge-up='cd /forge-deploy && docker compose up -d'
alias forge-down='cd /forge-deploy && docker compose down'
alias forge-logs='cd /forge-deploy && docker compose logs -f'
alias forge-ps='cd /forge-deploy && docker compose ps'
alias forge-restart='cd /forge-deploy && docker compose restart'
alias forge-pull='cd /forge-deploy && docker compose pull'
BASHRC

    chown -R vagrant:vagrant /home/vagrant

    echo ""
    echo "============================================"
    echo " Forge Deploy - Ready"
    echo "============================================"
    echo ""
    echo " Versions:"
    echo "   OS:             $(lsb_release -ds)"
    echo "   Docker:         $(docker --version 2>&1)"
    echo "   Docker Compose: $(docker compose version 2>&1)"
    echo ""
    echo " Quick start (vagrant ssh):"
    echo "   cd /forge-deploy"
    echo "   docker compose up -d"
    echo ""
    echo " Or use aliases:"
    echo "   forge-up      - Start all services"
    echo "   forge-down    - Stop all services"
    echo "   forge-logs    - Follow logs"
    echo "   forge-ps      - Show service status"
    echo "   forge-pull    - Pull latest images"
    echo ""
    echo " Access:"
    echo "   HTTPS: https://192.168.56.22 (or https://localhost:8443)"
    echo "   HTTP:  http://192.168.56.22  (redirects to HTTPS)"
    echo "============================================"
  SHELL
end
