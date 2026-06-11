# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"
  config.vm.hostname = "forail-deploy"

  # Production deployment ports
  config.vm.network "forwarded_port", guest: 80,   host: 8080   # HTTP
  config.vm.network "forwarded_port", guest: 443,  host: 8443   # HTTPS
  config.vm.network "forwarded_port", guest: 8013, host: 8013   # Forail web internal

  config.vm.network "private_network", ip: "192.168.56.22"

  config.vm.provider "virtualbox" do |vb|
    vb.name = "forail-deploy"
    vb.memory = "8192"
    vb.cpus = 4
  end

  config.vm.provider "libvirt" do |lv|
    lv.memory = 8192
    lv.cpus = 4
  end

  config.vm.synced_folder ".", "/forail-deploy", type: "rsync",
    rsync__exclude: [".git/", "*.pyc", "__pycache__/"]

  config.vm.provision "shell", inline: <<-SHELL
    set -euo pipefail

    echo "============================================"
    echo " Forail Deploy - Ubuntu 24.04"
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
    mkdir -p /forail-deploy/nginx/ssl
    if [ ! -f /forail-deploy/nginx/ssl/fullchain.pem ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /forail-deploy/nginx/ssl/privkey.pem \
            -out /forail-deploy/nginx/ssl/fullchain.pem \
            -subj "/C=RS/ST=Belgrade/L=Belgrade/O=Forail Platform/CN=forail.local"
    fi

    # --- .env file ---
    if [ ! -f /forail-deploy/.env ]; then
        SECRET_KEY=$(openssl rand -hex 32)
        WS_SECRET=$(openssl rand -hex 32)
        DB_PASS=$(openssl rand -hex 16)
        ADMIN_PASS=$(openssl rand -base64 12)

        cat > /forail-deploy/.env << ENVFILE
POSTGRES_USER=forail
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=forail
FORAIL_SECRET_KEY=${SECRET_KEY}
FORAIL_BROADCAST_WEBSOCKET_SECRET=${WS_SECRET}
FORAIL_ADMIN_USER=admin
FORAIL_ADMIN_PASSWORD=${ADMIN_PASS}
FORAIL_ADMIN_EMAIL=admin@forail.local
FORAIL_ALLOWED_HOSTS=*
FORAIL_CSRF_TRUSTED_ORIGINS=https://192.168.56.22,https://localhost:8443,https://forail.local
FORAIL_NODE_NAME=forail-node
FORAIL_NODE_TYPE=hybrid
FORAIL_IMAGE=ghcr.io/forail-platform/forail-backend
FORAIL_TAG=latest
ENVFILE
        echo "Generated .env with random secrets."
        echo "Admin password: ${ADMIN_PASS}"
    fi

    # --- Workspace setup ---
    ln -sf /forail-deploy /home/vagrant/forail-deploy

    cat >> /home/vagrant/.bashrc << 'BASHRC'

# Forail Deploy Environment
export FORAIL_DEPLOY=/forail-deploy
alias forail-up='cd /forail-deploy && docker compose up -d'
alias forail-down='cd /forail-deploy && docker compose down'
alias forail-logs='cd /forail-deploy && docker compose logs -f'
alias forail-ps='cd /forail-deploy && docker compose ps'
alias forail-restart='cd /forail-deploy && docker compose restart'
alias forail-pull='cd /forail-deploy && docker compose pull'
BASHRC

    chown -R vagrant:vagrant /home/vagrant

    echo ""
    echo "============================================"
    echo " Forail Deploy - Ready"
    echo "============================================"
    echo ""
    echo " Versions:"
    echo "   OS:             $(lsb_release -ds)"
    echo "   Docker:         $(docker --version 2>&1)"
    echo "   Docker Compose: $(docker compose version 2>&1)"
    echo ""
    echo " Quick start (vagrant ssh):"
    echo "   cd /forail-deploy"
    echo "   docker compose up -d"
    echo ""
    echo " Or use aliases:"
    echo "   forail-up      - Start all services"
    echo "   forail-down    - Stop all services"
    echo "   forail-logs    - Follow logs"
    echo "   forail-ps      - Show service status"
    echo "   forail-pull    - Pull latest images"
    echo ""
    echo " Access:"
    echo "   HTTPS: https://192.168.56.22 (or https://localhost:8443)"
    echo "   HTTP:  http://192.168.56.22  (redirects to HTTPS)"
    echo "============================================"
  SHELL
end
