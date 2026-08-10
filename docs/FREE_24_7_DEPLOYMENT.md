# Free Deployment Runbook: Railway Fallback and Oracle Alternative

This guide moves the backend off your Windows computer. For Nigeria, the active topology is the existing Railway project:

```text
Browser -> Vercel frontend
              |
              v
       Railway API -> Postgres, Redis, indexer + embedded processor
```

The Vercel project remains the frontend. Do not run the production backend from `localhost`.

## Important constraints

- Railway Free has a small monthly resource allowance and is not an uptime guarantee.
- Oracle Always Free is an optional VM migration path, but signup or capacity may be unavailable in Nigeria.
- Oracle may request a phone number and payment card for verification; Oracle states the card is not charged unless the account is upgraded.
- Stay within the Always Free allowance: use one Ampere A1 VM with `2 OCPUs` and `8 GB` RAM. Oracle currently lists up to `2 OCPUs` and `12 GB` total for Always Free Ampere A1 compute.
- You need a domain or subdomain for the API's automatic HTTPS certificate. The example below uses `api.example.com`.
- Never commit `.env`, paste provider keys into chat, or expose Postgres/Redis ports publicly.

## Nigeria-compatible fallback: existing Railway project

If Oracle Cloud signup or capacity is unavailable in Nigeria, use the Railway project that is already connected to this repository:

- [Railway Dashboard](https://railway.app/dashboard)
- [Railway pricing and free limits](https://docs.railway.com/pricing)
- [Railway restart policy](https://docs.railway.com/deployments/restart-policy)

This is the fastest no-new-provider path:

1. Keep Vercel as the frontend.
2. Keep Railway Postgres, Redis, API, and indexer services.
3. Set these indexer variables in Railway:

   ```text
   INDEXER_ENABLE_STREAM=true
   INDEXER_ENABLE_DISCOVERY=true
   INDEXER_EMBED_PROCESSOR=true
   INDEXER_EMBED_ALERTS=true
   ALERTS_RUN_RECOVERY_PASS=true
   WALLET_DISCOVERY_AUTOMATION_ENABLED=true
   WALLET_DISCOVERY_SCHEDULE_MS=900000
   DISCOVER_WALLET_SINCE_HOURS=24
   DISCOVER_WALLET_TOKEN_LIMIT=12
   DISCOVER_WALLET_TX_LIMIT=25
   DISCOVER_WALLET_LIMIT=8
   DISCOVER_WALLET_MIN_SCORE=8
   DISCOVERY_SCHEDULE_MS=15000
   DISCOVERY_MAX_EVENTS=150
   ALERT_OUTCOME_AUTOMATION_ENABLED=true
   ALERT_OUTCOME_SCHEDULE_MS=900000
   ```

4. Deploy the current `main` branch to the Railway `indexer` service.
5. Confirm the indexer logs contain `Processor service started`, `Indexer service started`, `Live discovery pass complete`, and `Live wallet discovery pass complete`.
6. Keep Vercel's `NEXT_PUBLIC_API_URL` pointed at the Railway API URL until a VM-based API is available.

This keeps the application usable at zero monthly subscription cost, but Railway Free is not a 24/7 guarantee: it includes only a small monthly resource allowance and does not provide the paid `Always` restart policy. If the allowance is exhausted, Railway stops workloads. It is suitable for a personal app and testing, not an uptime guarantee.

Render is not a better replacement for this requirement: its free web services sleep after 15 minutes without inbound traffic, and its free Postgres databases expire after 30 days. See [Render free instance limits](https://render.com/docs/free).

## Optional Oracle migration

### 1. Create the Oracle account

Open the official signup page:

- [Oracle Cloud Free Tier signup](https://signup.cloud.oracle.com/)
- [Oracle Free Tier terms and limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

During signup:

1. Use the account you want to own the project.
2. Choose the home region carefully. Always Free compute must be created in that region.
3. Complete email, phone, and payment verification if requested.
4. Do not upgrade the account or create paid resources.

After signup, open the [Oracle Cloud Console](https://cloud.oracle.com/).

## 2. Create an SSH key on Windows

Run this in PowerShell on your Windows machine. Do not share the private key.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\aegis-oracle" -C "aegis-terminal"
Get-Content "$env:USERPROFILE\.ssh\aegis-oracle.pub"
```

Keep these files locally:

- Private key: `%USERPROFILE%\.ssh\aegis-oracle`
- Public key: `%USERPROFILE%\.ssh\aegis-oracle.pub`

Only the contents of the `.pub` file will be pasted into Oracle.

## 3. Create the Always Free VM

Open **Compute > Instances > Create instance**. Oracle's reference page is [Creating an Instance](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm).

Use these settings:

1. **Name:** `aegis-terminal`
2. **Compartment:** your root/default compartment
3. **Image:** Ubuntu 24.04 LTS, ARM64/aarch64
4. **Shape:** `VM.Standard.A1.Flex`
5. **OCPUs:** `2`
6. **Memory:** `8 GB`
7. Confirm the console labels the shape **Always Free-eligible**.
8. **Networking:** use **Create new virtual cloud network** or the VCN Wizard with Internet Connectivity.
9. **Subnet:** public subnet
10. **Public IPv4:** assign a public IPv4 address
11. **SSH keys:** choose **Paste public keys** and paste the output from `aegis-oracle.pub`.
12. Keep the default boot volume unless Oracle shows that the selected size is not Always Free-eligible.
13. Click **Create**.

If Oracle reports **out of host capacity**, try another availability domain in your home region or retry later. Do not switch to a paid shape.

Wait until the instance state is **Running**, then copy its public IPv4 address.

## 4. Open the network ports

You must allow traffic in Oracle's VCN and on Ubuntu. Oracle's reference is [Security Rules](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm).

In the Oracle Console:

1. Open the instance and click its **Subnet**.
2. Open the subnet's **Default Security List**.
3. Click **Add Ingress Rules**.
4. Add a stateful TCP rule with source `0.0.0.0/0` and destination port `80`.
5. Add another stateful TCP rule with source `0.0.0.0/0` and destination port `443`.
6. Keep SSH port `22` restricted to your own public IP if possible. Do not open ports `5432`, `6379`, or `4000`.

Connect to the VM from PowerShell:

```powershell
ssh -i "$env:USERPROFILE\.ssh\aegis-oracle" ubuntu@YOUR_PUBLIC_IP
```

Replace `YOUR_PUBLIC_IP` with the address shown by Oracle.

On the VM, configure Ubuntu's firewall:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

## 5. Install Docker Engine

Use Docker's [official Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/). Ubuntu ARM64 is supported.

Run the repository installation commands on the VM:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<'EOF'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: arm64
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
docker run hello-world
docker compose version
```

If the VM image is not Ubuntu 24.04, replace `Suites: noble` with the Ubuntu codename shown by:

```bash
. /etc/os-release && echo "$VERSION_CODENAME"
```

## 6. Clone the project

The correct repository is [jacuzzi8888/memecoin-intelligence-terminal](https://github.com/jacuzzi8888/memecoin-intelligence-terminal).

```bash
cd ~
git clone https://github.com/jacuzzi8888/memecoin-intelligence-terminal.git
cd ~/memecoin-intelligence-terminal
```

## 7. Create the production environment file

```bash
cp .env.example .env
nano .env
```

Set or replace the following values. Use your real Helius key only in this VM file; do not put it in GitHub or the frontend.

```env
NODE_ENV=production

POSTGRES_USER=memecoin
POSTGRES_PASSWORD=USE_A_LONG_URL_SAFE_RANDOM_PASSWORD
POSTGRES_DB=memecoin_intelligence

NEXT_PUBLIC_APP_URL=https://memecoin-intelligence-terminal-inky.vercel.app
NEXTAUTH_URL=https://memecoin-intelligence-terminal-inky.vercel.app
NEXTAUTH_SECRET=USE_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS

API_PORT=4000
API_HOST=0.0.0.0

SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
SOLANA_WS_URL=wss://atlas-mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
HELIUS_API_KEY=YOUR_HELIUS_KEY

CORS_ORIGIN=https://memecoin-intelligence-terminal-inky.vercel.app
PERSONAL_APP_MODE=true
ENABLE_DEV_AUTH=true
ENABLE_LIVE_TRADING=false
API_WRITE_TOKEN=GENERATE_A_RANDOM_VALUE_AT_LEAST_32_CHARACTERS

INDEXER_ENABLE_STREAM=true
INDEXER_ENABLE_DISCOVERY=true
DISCOVERY_SCHEDULE_MS=15000
DISCOVERY_MAX_EVENTS=150
DISCOVERY_SIGNAL_REFRESH_MINUTES=45
INDEXER_EMBED_ALERTS=true
ALERTS_RUN_RECOVERY_PASS=true
ALERT_OUTCOME_AUTOMATION_ENABLED=true
ALERT_OUTCOME_SCHEDULE_MS=900000
WALLET_SYNC_AUTOMATION_ENABLED=true

API_DOMAIN=api.example.com
```

Use a password containing only letters, numbers, `_`, and `-` so the Compose-generated Postgres URL remains valid. The Compose profile supplies the internal Docker values for `DATABASE_URL` and `REDIS_URL`; do not expose those services to the Internet.

Save in nano with `Ctrl+O`, press `Enter`, then exit with `Ctrl+X`.

## 8. Point DNS to the VM

At your domain registrar or DNS provider, create:

```text
Type: A
Name: api
Value: YOUR_PUBLIC_IP
TTL: 300
```

This creates `api.example.com`. Replace `example.com` with your actual domain and update `API_DOMAIN` and `CORS_ORIGIN` if your frontend uses a custom Vercel domain.

From the VM, check DNS before starting Caddy:

```bash
sudo apt install -y dnsutils
nslookup api.example.com
```

The result must contain the VM's public IP. Caddy uses the domain to obtain and renew HTTPS certificates automatically. See [Caddy automatic HTTPS](https://caddyserver.com/docs/caddyfile/options) and [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## 9. Start the backend

From the repository root on the VM:

```bash
docker compose -f deploy/free-vm/docker-compose.yml config
docker compose -f deploy/free-vm/docker-compose.yml up -d --build
docker compose -f deploy/free-vm/docker-compose.yml ps
```

The expected services are:

```text
postgres
redis
api
indexer
processor
caddy
```

View startup logs:

```bash
docker compose -f deploy/free-vm/docker-compose.yml logs --tail=200 api indexer processor caddy
```

## 10. Verify the API

Run these on the VM or from Windows PowerShell:

```bash
curl -i https://api.example.com/health
curl -i https://api.example.com/api/v1/status
```

Expected results:

- `/health` returns HTTP `200`.
- Database and Redis report `up`.
- `/api/v1/status` returns HTTP `200`.
- After the first discovery pass, counts begin increasing.

An API that is healthy but still reports zero tokens means the Helius/indexer path is not producing data yet. Check:

```bash
docker compose -f deploy/free-vm/docker-compose.yml logs --tail=300 indexer processor
```

The indexer now retries WebSocket connections indefinitely and runs a five-minute discovery fallback. Do not add sample or fabricated data to make the dashboard appear populated.

## 11. Connect Vercel to the new API

Open the [Vercel Dashboard](https://vercel.com/dashboard), switch to the `jacuzzi8888s-projects` team, and open the `memecoin-intelligence-terminal` project.

Go to **Settings > Environment Variables**. Vercel's reference is [Environment Variables](https://vercel.com/docs/environment-variables).

Create or update this variable for **Production**:

```text
Name: NEXT_PUBLIC_API_URL
Value: https://api.example.com
Environment: Production
```

Save it, then trigger a new production deployment. Environment changes apply to new deployments, not previous builds.

After deployment, open:

```text
https://memecoin-intelligence-terminal-inky.vercel.app/dashboard
```

Hard-refresh the page with `Ctrl+F5`.

## 12. Confirm browser-to-API connectivity

From PowerShell:

```powershell
curl.exe -i -H "Origin: https://memecoin-intelligence-terminal-inky.vercel.app" https://api.example.com/health
curl.exe -i -H "Origin: https://memecoin-intelligence-terminal-inky.vercel.app" "https://api.example.com/api/v1/dashboard?signalLimit=5&alertLimit=5"
```

The response must include:

```text
access-control-allow-origin: https://memecoin-intelligence-terminal-inky.vercel.app
```

## 13. Reboot test

This confirms the system comes back after a VM restart:

```bash
sudo reboot
```

Wait one to two minutes, reconnect over SSH, and run:

```bash
cd ~/memecoin-intelligence-terminal
docker compose -f deploy/free-vm/docker-compose.yml ps
curl -i https://api.example.com/health
```

All containers use `restart: unless-stopped`, and Docker is enabled at boot.

## 14. Update the application

When changes are pushed to the repository:

```bash
cd ~/memecoin-intelligence-terminal
git pull --ff-only origin main
docker compose -f deploy/free-vm/docker-compose.yml up -d --build
docker compose -f deploy/free-vm/docker-compose.yml ps
```

Run migrations through the API container during startup. Review logs before considering the update complete.

## Useful links

- [Oracle Free Tier signup](https://signup.cloud.oracle.com/)
- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle instance creation](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm)
- [Oracle security rules](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm)
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/caddyfile/options)
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Project repository](https://github.com/jacuzzi8888/memecoin-intelligence-terminal)
