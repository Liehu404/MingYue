# Deployment

## Prerequisites

- Ubuntu 24.04 LTS or compatible Linux host
- Python 3.12+
- Nginx
- systemd

## Backend Installation

```bash
sudo mkdir -p /opt/mingyue
sudo chown -R www-data:www-data /opt/mingyue

cd /opt/mingyue
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt

sudo install -m 0750 -o www-data -g www-data -d /opt/mingyue/uploads
sudo install -m 0640 -o root -g www-data deploy/systemd/mingyue.env.example /etc/mingyue/backend.env
```

Edit `/etc/mingyue/backend.env` before starting the service. Use a strong random `SECRET_KEY`. Enable `SEED_SUPER_ADMIN` only during controlled bootstrap.

## systemd

```bash
sudo cp deploy/systemd/mingyue.service /etc/systemd/system/mingyue.service
sudo systemctl daemon-reload
sudo systemctl enable --now mingyue
sudo systemctl status mingyue --no-pager
```

## Nginx

```bash
sudo cp deploy/nginx/mingyue.conf /etc/nginx/sites-available/mingyue
sudo ln -sfn /etc/nginx/sites-available/mingyue /etc/nginx/sites-enabled/mingyue
sudo nginx -t
sudo systemctl reload nginx
```

## Health Check

```bash
curl http://127.0.0.1:8000/api/health
curl http://YOUR_HOST/api/health
```

## Data Policy

Do not commit production SQLite databases, uploaded files, `.env` files, or virtual environments. Back them up through a separate private backup process.
