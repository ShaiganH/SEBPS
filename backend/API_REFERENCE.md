# SEBPS Backend — API Reference

Base URL: `http://localhost:8000/api/v1`
Interactive docs: `http://localhost:8000/api/v1/docs/`

All endpoints except register/login require:
```
Authorization: Bearer <access_token>
```

---

## Auth  `/auth/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register/` | Register new user, returns tokens |
| POST | `/auth/login/` | Login, returns JWT access + refresh |
| POST | `/auth/logout/` | Blacklist refresh token |
| POST | `/auth/token/refresh/` | Refresh access token |
| GET  | `/auth/me/` | Get current user profile |
| PUT  | `/auth/me/` | Update profile (ref_no, load, phase…) |
| POST | `/auth/change-password/` | Change password |
| GET  | `/auth/dashboard/` | Combined home dashboard summary |

---

## OCR  `/ocr/`  — 3-Step Flow

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ocr/upload/` | **Step 1**: Upload image → start async OCR (default: auto_fetch=false) |
| GET  | `/ocr/status/<id>/` | **Step 2**: Poll until `status=success`, see `extracted_ref_no` |
| POST | `/ocr/<id>/confirm/` | **Step 3**: User confirms/corrects ref_no → triggers LESCO fetch |
| GET  | `/ocr/history/` | All OCR jobs for current user |

**Upload body:** `multipart/form-data`, field `image`
**Confirm body:** `{"ref_no": "08 11274 1172000U"}` (omit to use OCR result as-is)
**After confirm:** LESCO fetch job fires → bills saved → prediction auto-generated → smart recommendation sent

---

## Bills  `/bills/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/bills/` | List all bills (oldest→newest) |
| GET    | `/bills/<id>/` | Single bill detail |
| DELETE | `/bills/<id>/` | Delete bill |
| POST   | `/bills/manual/` | Manually enter a bill |
| POST   | `/bills/fetch/` | Trigger LESCO auto-fetch (async) |
| GET    | `/bills/fetch/<job_id>/` | Check fetch job status |
| GET    | `/bills/fetch/jobs/` | All fetch jobs |

**Fetch body:** `{"ref_no": "08 11274 1172000U"}`

---

## Predictions  `/predictions/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/predictions/generate/` | Run ML prediction (synchronous) |
| GET  | `/predictions/` | All predictions |
| GET  | `/predictions/latest/` | Most recent prediction |
| GET  | `/predictions/<id>/` | Single prediction detail |
| GET  | `/predictions/<id>/compare/` | Model comparison table |

**Generate body:**
```json
{
  "units_so_far": 180,
  "days_elapsed": 21,
  "total_cycle_days": 30
}
```
Optional overrides: `fpa_per_unit`, `qta_per_unit`, `sanctioned_load_kw`, `is_protected`, `is_tax_filer`, `phase`

---

## IoT  `/iot/`

### Device Management (JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/iot/devices/` | List user's devices |
| POST   | `/iot/devices/` | Register new ESP32 device |
| GET    | `/iot/devices/<id>/` | Device detail |
| PUT    | `/iot/devices/<id>/` | Update device |
| DELETE | `/iot/devices/<id>/` | Remove device |
| GET    | `/iot/devices/<id>/token/` | Get device bearer token |
| POST   | `/iot/devices/<id>/token/` | Rotate device token |

### Reading Ingestion (Device Token — ESP32)
| Method | Endpoint | Auth Header | Description |
|--------|----------|-------------|-------------|
| POST   | `/iot/readings/` | `X-Device-Token: <token>` | Post reading from ESP32 |

**Reading body:**
```json
{
  "voltage": 225.4,
  "current": 2.1,
  "power": 473.3,
  "energy": 12.54,
  "frequency": 50.0,
  "power_factor": 0.99
}
```

### Reading Retrieval (JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/iot/readings/<device_id>/` | Paginated readings (add `?hours=24`) |
| GET    | `/iot/readings/<device_id>/latest/` | Latest single reading |
| GET    | `/iot/stats/<device_id>/` | Aggregated stats (add `?period=24h\|7d\|30d`) |

### WebSocket (real-time)
```
ws://localhost:8000/ws/iot/<device_id>/
```
Requires JWT in `Authorization` header. Receives `{"type": "reading", "data": {...}}` events.

---

## Appliances  `/appliances/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/appliances/catalog/` | Built-in appliance catalog |
| GET    | `/appliances/` | User's appliances |
| POST   | `/appliances/` | Add appliance |
| GET    | `/appliances/<id>/` | Detail |
| PUT    | `/appliances/<id>/` | Update |
| DELETE | `/appliances/<id>/` | Soft-delete (sets `is_active=false`) |
| POST   | `/appliances/analyze/` | Real-time budget impact — **no DB write** |
| POST   | `/appliances/optimize/` | Auto-adjust hours to meet budget — **no DB write** |
| POST   | `/appliances/optimize/apply/` | Persist optimized hours to DB |

### Analyze body
```json
{
  "appliances": [
    {"name": "AC 1.5 Ton", "wattage_w": 1500, "hours_per_day": 8, "quantity": 2, "category": "Cooling"},
    {"name": "Refrigerator", "wattage_w": 150, "hours_per_day": 24, "quantity": 1}
  ],
  "use_saved_appliances": false,
  "budget_pkr": 20000
}
```
Returns: `summary` (total_units, total_bill_pkr, budget_used_pct, within_budget, over_budget_by_pkr),
`appliance_breakdown` (per-appliance units/share/save_per_1hr), `slab_alerts` (non-linear boundary warnings), `tip`.

### Optimize body
Same structure as analyze. Returns `optimization_steps` (step-by-step greedy reduction log),
`optimized_appliances` (original vs new hours for each), and `summary` (original_bill → final_bill, pkr_saved, budget_met).

### Optimize apply body
```json
{"adjustments": [{"id": 3, "hours_per_day": 5.5}, {"id": 7, "hours_per_day": 2.0}]}
```

---

## Budget  `/budget/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/budget/` | Current budget + live usage % |
| POST   | `/budget/` | Set budget (creates or replaces) |
| PUT    | `/budget/update/` | Partial update |
| GET    | `/budget/alerts/` | Historical threshold alerts |
| GET    | `/budget/history/` | Month-by-month actual vs budget |

---

## Recommendations  `/recommendations/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/recommendations/generate/` | Run rule-based recommender analysis |
| POST   | `/recommendations/smart/` | Combined rule-based + GROQ AI, situation-aware |
| GET    | `/recommendations/` | All recommendations |
| GET    | `/recommendations/<id>/` | Detail with reduction steps |
| POST   | `/recommendations/<id>/apply/` | Simulate specific hour reductions |

### Smart recommendation (`/recommendations/smart/`)
Determines your budget situation and returns tailored advice:

| Situation | Trigger | Response tone |
|-----------|---------|---------------|
| `well_within` | < 50% budget used | Encouragement + stay-on-track tips |
| `midway` | 50–74% | Moderate alert + top savings opportunities |
| `approaching` | 75–99% | Urgent — specific appliance cuts with PKR savings |
| `exceeded` | ≥ 100% | Critical — auto-suggest + GROQ 3-step action plan |

**Body** (all fields optional):
```json
{"prediction_id": 5, "budget_pkr": 20000, "budget_units": 400}
```
**Returns:**
```json
{
  "situation": "approaching",
  "budget_status": {
    "predicted_bill_pkr": 17800,
    "budget_pkr": 20000,
    "pct_used": 89.0,
    "over_budget_by_pkr": 0,
    "within_budget": true
  },
  "rule_based": {
    "appliance_breakdown": [...],
    "units_to_save": 45,
    "pkr_gap": 2200
  },
  "auto_optimization": {
    "steps": [...],
    "optimized_bill_pkr": 18500,
    "optimized_units": 360,
    "total_saved_pkr": 1300
  },
  "groq_advice": "Cut your AC from 8h to 6h — saves ~Rs 1200/month..."
}
```

---

## Chatbot  `/chatbot/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/chatbot/message/` | Send message, get AI response |
| GET    | `/chatbot/sessions/` | All chat sessions |
| GET    | `/chatbot/sessions/<id>/` | Session with full message history |
| DELETE | `/chatbot/sessions/<id>/` | Archive session |
| GET    | `/chatbot/starters/` | Suggested starter prompts |

**Message body:**
```json
{
  "message": "How can I reduce my bill?",
  "session_id": 3,
  "stream": false
}
```
For streaming, set `"stream": true` — response is `text/event-stream`.

---

## Notifications  `/notifications/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/notifications/` | All notifications (add `?unread=true`) |
| GET    | `/notifications/unread/` | Unread count |
| PUT    | `/notifications/<id>/read/` | Mark single as read |
| POST   | `/notifications/read-all/` | Mark all as read |
| DELETE | `/notifications/<id>/` | Delete notification |

---

## Error Format

All errors follow:
```json
{
  "detail": "Human-readable error message",
  "errors": { "field": ["validation error"] }
}
```
