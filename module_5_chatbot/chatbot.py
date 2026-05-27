"""
Module 5 — AI Chatbot Advisor (Groq API)

Provides a context-aware electricity bill advisor powered by Groq's LLM.
"Per-user tuning" is achieved by injecting the user's real LESCO data
(consumption history, appliances, prediction, budget, tariff settings)
into every system prompt — so every answer is specific to that account.

Usage
-----
from chatbot import build_context, chat

context = build_context(
    ref_no       = "08 11274 1172000U",
    bill_kwargs  = {...},
    history_data = {...},       # from module_3_fetcher
    prediction   = {...},       # from module_1_predictor
    appliances   = [...],       # from module_4_recommender
    budget_pkr   = 9000,
    budget_units = 250,
)

for chunk in chat(messages, context, stream=True):
    print(chunk, end='', flush=True)
"""

import os
import sys

# ── Groq client ───────────────────────────────────────────────────────────────

_API_KEY = os.getenv("GROQ_API_KEY")
MODEL    = "llama-3.3-70b-versatile"   # Groq's most capable model (fast inference)

_client = None


def _get_client():
    global _client
    if _client is None:
        from groq import Groq
        _client = Groq(api_key=_API_KEY)
    return _client


# ── System-prompt builder (per-user context injection) ────────────────────────

def build_context(
    ref_no:       str  | None = None,
    bill_kwargs:  dict | None = None,
    history_data: dict | None = None,
    prediction:   dict | None = None,
    appliances:   list | None = None,
    budget_pkr:   float | None = None,
    budget_units: int   | None = None,
) -> dict:
    """
    Assembles a context dict from the user's session data.
    Pass this directly to chat() — it is embedded into the system prompt.
    """
    return {
        "ref_no":       ref_no,
        "bill_kwargs":  bill_kwargs  or {},
        "history_data": history_data,
        "prediction":   prediction,
        "appliances":   appliances   or [],
        "budget_pkr":   budget_pkr,
        "budget_units": budget_units,
    }


def _build_system_prompt(context: dict) -> str:
    """
    Convert the user's context dict into a rich system prompt.
    Every field that is present is rendered as a human-readable section.
    The LLM will cite these numbers rather than hallucinate.
    """
    lines: list[str] = []

    # ── Role definition ───────────────────────────────────────────────────────
    lines += [
        "You are an expert LESCO electricity bill advisor for Pakistani households.",
        "You have access to the user's real consumption data shown below.",
        "Always base your answers on the exact numbers provided — never invent figures.",
        "Be concise, specific, and practical.  Use bullet points for multi-step advice.",
        "Respond in the same language the user writes in (English or Urdu / Roman Urdu).",
        "",
    ]

    # ── Tariff education ──────────────────────────────────────────────────────
    lines += [
        "━━━  LESCO TARIFF SYSTEM  ━━━",
        "LESCO uses a NON-TELESCOPING (flat block-rate) tariff:",
        "ALL units are billed at the single rate matching the total consumption slab.",
        "Slabs (IESCO/LESCO A-1 Residential, 2025-26 SRO 279):",
        "  1 – 100  units → Rs 22.44 / kWh",
        "  101 – 200      → Rs 28.91 / kWh",
        "  201 – 300      → Rs 33.10 / kWh",
        "  301 – 400      → Rs 36.46 / kWh",
        "  401 – 500      → Rs 38.95 / kWh",
        "  501 – 600      → Rs 40.22 / kWh",
        "  601 – 700      → Rs 41.85 / kWh",
        "  700+           → Rs 47.20 / kWh",
        "KEY: Dropping a few units at a slab boundary saves MUCH more than dropping",
        "     the same units in the middle of a slab — always highlight this.",
        "",
    ]

    # ── Account info ──────────────────────────────────────────────────────────
    lines.append("━━━  USER ACCOUNT  ━━━")
    if context.get("ref_no"):
        lines.append(f"  Reference Number : {context['ref_no']}")

    bk = context.get("bill_kwargs") or {}
    if bk:
        lines.append(f"  Sanctioned Load  : {bk.get('sanctioned_load_kw', '?')} kW")
        lines.append(f"  Protected Consumer: {'Yes' if bk.get('protected') else 'No'}")
        lines.append(f"  Tax Filer        : {'Yes' if bk.get('is_tax_filer') else 'No'}")
        lines.append(f"  FPA surcharge    : {bk.get('fpa_per_unit', '?')} Rs/unit")
        lines.append(f"  QTA surcharge    : {bk.get('qta_per_unit', '?')} Rs/unit")
    lines.append("")

    # ── 12-month history ──────────────────────────────────────────────────────
    hd = context.get("history_data")
    if hd:
        rows = hd.get("raw_rows", [])
        lines.append("━━━  12-MONTH CONSUMPTION HISTORY  ━━━")
        lines.append(f"  {'Month':<10}  {'Units':>6}  {'Bill (Rs)':>10}")
        lines.append(f"  {'─'*32}")
        for row in rows:
            lines.append(f"  {row['month']:<10}  {row['units']:>6}  {row['bill']:>10,}")

        units_list = hd.get("history_units", [])
        if units_list:
            avg  = sum(units_list) / len(units_list)
            hi   = max(units_list)
            lo   = min(units_list)
            hi_m = rows[units_list.index(hi)]['month'] if rows else '?'
            lo_m = rows[units_list.index(lo)]['month'] if rows else '?'
            lines += [
                f"  {'─'*32}",
                f"  Average  : {avg:.0f} units/month",
                f"  Peak     : {hi} units ({hi_m})",
                f"  Lowest   : {lo} units ({lo_m})",
            ]
        lines.append("")

    # ── Prediction ────────────────────────────────────────────────────────────
    pred = context.get("prediction")
    if pred:
        p = pred.get("prediction", {})
        b = p.get("bill", {})
        c = pred.get("confidence", {})
        lines.append("━━━  NEXT-MONTH PREDICTION  ━━━")
        lines.append(f"  Predicted Units  : {p.get('units', '?')} u")
        lines.append(f"  Estimated Bill   : Rs {b.get('total_payable', 0):,.0f}")
        lines.append(f"  ── Bill breakdown:")
        lines.append(f"     Energy cost     : Rs {b.get('energy_cost', 0):,.2f}")
        lines.append(f"     Fixed charge    : Rs {b.get('fixed_charge', 0):,.2f}")
        lines.append(f"     FPA             : Rs {b.get('fpa', 0):,.2f}")
        lines.append(f"     QTA             : Rs {b.get('qta', 0):,.2f}")
        lines.append(f"     Electricity Duty: Rs {b.get('electricity_duty', 0):,.2f}")
        lines.append(f"     TV Fee          : Rs {b.get('tv_fee', 0):,.2f}")
        lines.append(f"     GST             : Rs {b.get('gst', 0):,.2f}")
        lines.append(f"     Income Tax      : Rs {b.get('income_tax', 0):,.2f}")
        lines.append(f"  Confidence blend : History {c.get('history_weight_pct', '?')}% "
                     f"/ Projection {c.get('projection_weight_pct', '?')}%")
        lines.append(f"  Primary source   : {c.get('primary_source', '?')}")
        lines.append("")

    # ── Appliance list ────────────────────────────────────────────────────────
    appliances = context.get("appliances") or []
    if appliances:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__),
                                        '..', 'module_4_recommender'))
        try:
            from recommender import appliance_monthly_units
            lines.append("━━━  USER'S APPLIANCES  ━━━")
            lines.append(f"  {'Appliance':<32}  {'W':>5}  {'Hrs/day':>7}  "
                         f"{'Qty':>4}  {'Units/mo':>9}  Category")
            lines.append(f"  {'─'*72}")
            total_u = 0.0
            for app in sorted(appliances,
                              key=lambda a: appliance_monthly_units(a), reverse=True):
                u = appliance_monthly_units(app)
                total_u += u
                lines.append(
                    f"  {app['name']:<32}  {app['wattage_w']:>5}  "
                    f"{app['hours_per_day']:>7}  {app['quantity']:>4}  "
                    f"{u:>9.1f}  {app.get('category','?')}"
                )
            lines += [
                f"  {'─'*72}",
                f"  {'TOTAL TRACKED':<32}  {'':>5}  {'':>7}  {'':>4}  {total_u:>9.1f}",
                "",
            ]
        except ImportError:
            pass

    # ── Budget targets ────────────────────────────────────────────────────────
    bpkr  = context.get("budget_pkr")
    bunits = context.get("budget_units")
    if bpkr or bunits:
        lines.append("━━━  USER'S BUDGET TARGETS  ━━━")
        if bpkr:
            lines.append(f"  Max monthly bill  : Rs {bpkr:,}")
        if bunits:
            lines.append(f"  Max monthly units : {bunits} u")
        lines.append("")

    # ── Guardrails ────────────────────────────────────────────────────────────
    lines += [
        "━━━  RESPONSE GUIDELINES  ━━━",
        "• Answer only electricity / bill / appliance / energy-saving questions.",
        "• For off-topic queries, politely redirect to electricity topics.",
        "• When suggesting reductions, always mention the slab effect.",
        "• Quantify savings in both units AND rupees where possible.",
        "• If data is missing (e.g. no appliances listed), ask the user to add them.",
    ]

    return "\n".join(lines)


# ── Public chat function ──────────────────────────────────────────────────────

def chat(
    messages: list[dict],
    context:  dict,
    stream:   bool = True,
):
    """
    Send a conversation to Groq and get the assistant's response.

    Parameters
    ----------
    messages : list of {"role": "user"|"assistant", "content": str}
               The conversation history (system prompt is prepended automatically).
    context  : dict from build_context() — injected as a rich system prompt.
    stream   : True → returns a generator of text chunks (for live streaming).
               False → returns the full response string at once.

    Returns
    -------
    generator[str]  (stream=True)
    str             (stream=False)
    """
    client  = _get_client()
    sysprompt = _build_system_prompt(context)

    full_messages = [{"role": "system", "content": sysprompt}] + messages

    response = client.chat.completions.create(
        model       = MODEL,
        messages    = full_messages,
        temperature = 0.35,    # low for factual bill advice; slightly above 0 for variety
        max_tokens  = 1200,
        stream      = stream,
    )

    if stream:
        def _gen():
            for chunk in response:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        return _gen()
    else:
        return response.choices[0].message.content


# ── Quick starter messages ────────────────────────────────────────────────────

STARTER_PROMPTS = [
    "What is my biggest electricity expense and how can I reduce it?",
    "Am I close to a slab boundary? What would I save by dropping below it?",
    "Which appliances should I cut first to meet my budget?",
    "Show me a comparison of my monthly usage — am I using more than usual?",
    "Give me a week-by-week action plan to reduce my bill by 20%.",
    "What time of day should I run my AC to save the most?",
]
