FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    chromium \
    chromium-driver \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV CHROMIUM_FLAGS="--no-sandbox"

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Install playwright browsers
RUN playwright install chromium

COPY . .
