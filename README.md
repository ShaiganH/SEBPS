# SEBPS — Smart Electricity Bill Prediction System

Full-stack energy monitoring app: Django REST API · React web · React Native mobile · AI chatbot · OCR bill scanning · IoT dashboard.

---

## Quick start

### 1. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- [Expo Go](https://expo.dev/go) installed on your phone (same Wi-Fi as your machine)

---

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set your machine's LAN IP (the IP your phone can reach):

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'
```

```env
# .env
HOST_IP=192.168.1.52    ← replace with your actual LAN IP
```

Then create the backend secrets file:

```bash
cp backend/.env.example backend/.env
# Fill in GROQ_API_KEY and LESCO credentials in backend/.env
```

---

### 3. Start everything

```bash
docker compose up --build
```

First run takes ~5 minutes (downloads images, installs deps, loads ML models).

| Service | URL |
|---------|-----|
| Web app | http://localhost:5173 |
| API docs | http://localhost:8000/api/v1/docs/ |
| Mobile | Open Expo Go → **Enter URL manually** → `exp://<HOST_IP>:8081` |

QR code also appears in the mobile container logs:

```bash
docker logs lesco_fyp-mobile-1
```

---

### 4. Subsequent runs

```bash
docker compose up          # no --build needed unless you changed dependencies
docker compose down        # stop everything (data is preserved in volumes)
docker compose down -v     # stop + wipe all data (fresh slate)
```

---

## Project structure

```
.
├── backend/            Django API (DRF, Channels, Celery, TimescaleDB)
├── frontend/           React + Vite web dashboard
├── mobile/             Expo React Native app
├── module_1_predictor/ Bill prediction model
├── module_2_ocr/       EasyOCR + Tesseract bill scanner
├── module_3_fetcher/   LESCO history scraper
├── module_4_recommender/ Rule-based energy tips
├── module_5_chatbot/   Groq-powered AI advisor
└── docker-compose.yml  Single-command stack (all 7 services)
```

---

## Services at a glance

| Container | Role |
|-----------|------|
| `db` | TimescaleDB (PostgreSQL 16) — time-series IoT data |
| `redis` | Celery broker + result backend |
| `api` | Django + Daphne (HTTP + WebSocket) |
| `celery_worker` | Async tasks: OCR, LESCO fetch, predictions |
| `celery_beat` | Scheduled tasks (IoT polling, etc.) |
| `frontend` | Vite dev server with `/api` proxy |
| `mobile` | Expo Metro bundler |

---

## Backend-only dev (no frontend/mobile)

```bash
cd backend
docker compose up --build
```

---

## Credentials (demo account)

```
Email:    shag@gmail.com
Password: shag@1234
```
