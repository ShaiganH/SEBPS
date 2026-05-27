#!/usr/bin/env bash
# SEBPS Backend — one-shot local development setup
set -e

echo "=== SEBPS Backend Setup ==="

# 1. Copy env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env — edit it with your GROQ_API_KEY and DB credentials."
fi

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install playwright browsers (for LESCO fetcher)
playwright install chromium

# 4. Run migrations (requires PostgreSQL with TimescaleDB to be running)
python manage.py migrate

# 5. Seed appliance catalog
python manage.py load_appliance_catalog

# 6. Create superuser (optional)
echo "Run: python manage.py createsuperuser"

echo ""
echo "=== Start services ==="
echo "  API server  : daphne -b 0.0.0.0 -p 8000 config.asgi:application"
echo "  Celery      : celery -A tasks.celery worker --loglevel=info"
echo "  Celery beat : celery -A tasks.celery beat --loglevel=info"
echo ""
echo "  Or use Docker: docker-compose up --build"
