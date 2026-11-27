# Deployment

## Prerequisites

- Linux host with systemd and Nginx
- Python 3.10+ (the portal host currently uses 3.10.12)
- `python3-venv` (install `python3.10-venv` if missing)

## Mode A: Standalone

```bash
sudo mkdir -p /opt/mingyue
sudo chown -R www-data:www-data /opt/mingyue

cd /opt/mingyue
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt

sudo install -m 0750 -o www-data -g www-data -d /opt/mingyue/uploads
sudo install -m 0640 -o root -g www-data deploy/systemd/mingyue.env.example /etc/mingyue/backend.env
```

Then install `deploy/systemd/mingyue.service` and `deploy/nginx/mingyue.conf`, enable the service,
`nginx -t`, and reload. Health: `curl http://127.0.0.1:8000/api/health`.

## Mode B: Portal subpath `/academic`

Target host layout:

```text
/opt/mingyue-academic/
├── backend/                    # this repo's backend/
├── static/academic/            # this repo's static/
├── uploads/
├── data_import/
├── data.db
├── venv/
└── backup/
```

### 1. Files

```bash
sudo mkdir -p /opt/mingyue-academic/{backend,static,uploads,data_import,backup}
sudo cp -a backend/. /opt/mingyue-academic/backend/
sudo cp -a static/.  /opt/mingyue-academic/static/academic/
sudo chown -R www-data:www-data /opt/mingyue-academic
```

Put the migrated `data.db`, `uploads/` and `data_import/` in place (see `MIGRATION.md`). SQLite needs
write access to the directory for WAL/SHM files.

### 2. Python environment

```bash
cd /opt/mingyue-academic
sudo python3 -m venv venv
sudo venv/bin/pip install -r backend/requirements.txt
sudo venv/bin/pip check
```

### 3. Environment file

```bash
sudo cp deploy/systemd/mingyue-academic.env.example /etc/mingyue-academic.env
sudo chmod 600 /etc/mingyue-academic.env
sudo chown root:www-data /etc/mingyue-academic.env
```

Replace `SECRET_KEY` with a long random value. Keep `PUBLIC_BASE_PATH=/academic` and
`KB_SCHEDULER_ENABLED=false` unless the Canvas tunnel is available.

### 4. systemd

```bash
sudo cp deploy/systemd/mingyue-academic.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mingyue-academic
sudo systemctl status mingyue-academic --no-pager
curl http://127.0.0.1:8001/api/health
```

The service must stay at `--workers 1`: the knowledge-base scheduler is in-process.

### 5. Nginx

Add the contents of `deploy/nginx/mingyue-academic.location.conf` inside the existing `listen 5000`
server block (for the model portal, `/etc/nginx/conf.d/mingyueai_5000.conf`). The 443 server already
proxies everything to 5000.

Also ensure the 443 server allows large uploads (`client_max_body_size 800m`); otherwise uploads are
rejected before reaching the 5000 server.

```bash
sudo cp /etc/nginx/conf.d/mingyueai_5000.conf /root/mingyueai_5000.conf.bak.$(date +%F-%H%M)
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Portal navigation

Add one link to the portal's top navigation and (optionally) the sidebars:

```html
<a href="/academic/">学术交流</a>
```

Templates: `templates/dashboard/_spark_topbar.html`, `templates/dashboard/new_chat.html`,
`templates/dashboard/favorites.html`. Reload gunicorn without restarting the other services:

```bash
MASTER=$(pgrep -f 'gunicorn.*5002' | head -1)
kill -HUP "$MASTER"
```

## Verification

```bash
curl -k https://mingyueai.cqu.edu.cn/academic/
curl -k https://mingyueai.cqu.edu.cn/academic/api/health
curl -k https://mingyueai.cqu.edu.cn/academic/data.html
curl -k -I https://mingyueai.cqu.edu.cn/academic/resources   # SPA fallback
```

SSO check (replace the test account with a controlled account):

```bash
curl -k -c /tmp/mq.cookies -X POST https://mingyueai.cqu.edu.cn/login \
  -d 'username=<TEST_USER>' -d 'password=<TEST_PASSWORD>'
curl -k -b /tmp/mq.cookies -X POST https://mingyueai.cqu.edu.cn/academic/api/v1/auth/sso
curl -k -H "Authorization: Bearer <TOKEN>" \
  https://mingyueai.cqu.edu.cn/academic/api/v1/auth/me
```

## Data Policy

Do not commit production SQLite databases, uploads, `data_import/`, `.env` files or virtual
environments. Back them up separately.
