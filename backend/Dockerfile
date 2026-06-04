FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV CHROMIUM_FLAGS="--no-sandbox"

WORKDIR /app

# System dependencies.
# NOTE: chromium / chromium-driver are NOT installed here — Playwright manages
# its own browser binary via `playwright install --with-deps chromium` below.
# Installing both is redundant and wastes ~120 MB.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies — --no-cache-dir saves ~300 MB of pip http cache
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Playwright downloads its own Chromium + installs any missing system libs.
# --with-deps replaces the old apt chromium install.
RUN playwright install --with-deps chromium

COPY . .
