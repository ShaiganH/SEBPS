"""
LESCO FYP — Local Testing Dashboard
Streamlit app that wires all 4 modules into a single testable interface.

Run:  streamlit run app.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_1_predictor'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_2_ocr'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_3_fetcher'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_4_recommender'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'module_5_chatbot'))

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import numpy as np

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="LESCO FYP Dashboard",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Session state init ────────────────────────────────────────────────────────
defaults = {
    'ref_no':          '',
    'history_data':    None,
    'prediction':      None,
    'appliances':      [],
    'budget_pkr':      None,
    'budget_units':    None,
    'chat_history':    [],          # [{role, content}, …]  for the AI chatbot
    'bill_kwargs': {
        'sanctioned_load_kw': 2.0,
        'protected':          False,
        'fpa_per_unit':       -1.597,
        'qta_per_unit':       -1.769,
        'phase':              'single_phase',
        'is_tax_filer':       False,
    },
}
for k, v in defaults.items():
    if k not in st.session_state:
        st.session_state[k] = v

# ── Cached resource loaders ───────────────────────────────────────────────────
@st.cache_resource(show_spinner="Loading OCR model (first time only)…")
def load_ocr_extractor():
    from ref_extractor import extract_reference_number
    return extract_reference_number

@st.cache_resource(show_spinner="Loading EasyOCR for CAPTCHA…")
def load_captcha_solver():
    from captcha_solver import solve
    return solve

@st.cache_resource(show_spinner="⏳ Loading EasyOCR model (first run only, ~20 sec)…")
def _warm_ocr_model():
    """
    Forces the EasyOCR reader singleton to load NOW, with a visible spinner,
    so the first click on 'Extract Reference Number' responds immediately.
    """
    from ocr_engine import _get_reader
    _get_reader()
    return True

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.image("https://upload.wikimedia.org/wikipedia/en/thumb/6/6a/LESCO_Logo.png/200px-LESCO_Logo.png",
             width=120)
    st.title("LESCO FYP")
    st.caption("Local Testing Dashboard")
    st.divider()

    page = st.radio("Navigate", [
        "⚡ Overview",
        "📷 Module 2 — OCR",
        "🌐 Module 3 — Fetcher",
        "📊 Module 1 — Predictor",
        "💡 Module 4 — Recommender",
        "🤖 AI Advisor",
    ])

    st.divider()
    st.subheader("⚙️ Tariff Settings")
    st.caption("Applied across all modules")
    st.session_state.bill_kwargs['sanctioned_load_kw'] = st.number_input(
        "Sanctioned Load (kW)", 0.5, 20.0,
        value=float(st.session_state.bill_kwargs['sanctioned_load_kw']), step=0.5)
    st.session_state.bill_kwargs['fpa_per_unit'] = st.number_input(
        "FPA (Rs/unit)", -5.0, 5.0,
        value=float(st.session_state.bill_kwargs['fpa_per_unit']), step=0.1)
    st.session_state.bill_kwargs['qta_per_unit'] = st.number_input(
        "QTA (Rs/unit)", -5.0, 5.0,
        value=float(st.session_state.bill_kwargs['qta_per_unit']), step=0.1)
    st.session_state.bill_kwargs['protected'] = st.checkbox(
        "Protected consumer", value=bool(st.session_state.bill_kwargs['protected']))
    st.session_state.bill_kwargs['is_tax_filer'] = st.checkbox(
        "Tax filer", value=bool(st.session_state.bill_kwargs['is_tax_filer']))

    if st.session_state.ref_no:
        st.divider()
        st.success(f"Ref: {st.session_state.ref_no}")
    if st.session_state.history_data:
        st.success(f"History: {len(st.session_state.history_data['history_units'])} months")
    if st.session_state.prediction:
        u = st.session_state.prediction['prediction']['units']
        b = st.session_state.prediction['prediction']['bill']['total_payable']
        st.success(f"Prediction: {u} u | Rs {b:,.0f}")


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 0 — OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
if page == "⚡ Overview":
    st.title("⚡ LESCO Bill Predictor — FYP Dashboard")
    st.markdown("Use the sidebar to navigate between modules. Data flows automatically from one module to the next.")

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.info("**Module 2 — OCR**\nUpload a LESCO bill photo → extract reference number automatically")
    with col2:
        st.info("**Module 3 — Fetcher**\nEnter ref no → auto-fetch 12-month consumption history from LESCO website")
    with col3:
        st.info("**Module 1 — Predictor**\nUse history → predict next month's units & full bill breakdown")
    with col4:
        st.info("**Module 4 — Recommender**\nAdd appliances + set budget → get reduction recommendations")

    st.divider()
    st.subheader("Pipeline Status")
    s = st.session_state
    steps = [
        ("Ref No", bool(s.ref_no),       s.ref_no or "Not set"),
        ("History", bool(s.history_data), f"{len(s.history_data['history_units'])} months fetched" if s.history_data else "Not fetched"),
        ("Prediction", bool(s.prediction), f"{s.prediction['prediction']['units']} units" if s.prediction else "Not run"),
        ("Appliances", bool(s.appliances), f"{len(s.appliances)} appliances added" if s.appliances else "None added"),
    ]
    cols = st.columns(4)
    for col, (label, done, detail) in zip(cols, steps):
        with col:
            st.metric(label, "✅ Done" if done else "⏳ Pending", detail)

    if s.history_data:
        st.divider()
        st.subheader("Quick History View")
        df = pd.DataFrame(s.history_data['raw_rows'])
        fig = px.bar(df, x='month', y='units', color='bill',
                     color_continuous_scale='Reds',
                     labels={'units': 'Units', 'bill': 'Bill (Rs)', 'month': 'Month'},
                     title=f"12-Month Consumption — {s.ref_no}")
        fig.update_layout(height=350)
        st.plotly_chart(fig, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 1 — MODULE 2: OCR
# ══════════════════════════════════════════════════════════════════════════════
elif page == "📷 Module 2 — OCR":
    st.title("📷 Module 2 — OCR Reference Number Extractor")
    st.markdown("Upload a photo of your LESCO bill. The OCR engine will extract the reference number automatically.")

    # Pre-warm EasyOCR the moment the user arrives on this page.
    # @st.cache_resource ensures the model only loads once; subsequent page
    # visits hit the cache instantly and show no spinner at all.
    _warm_ocr_model()

    tab1, tab2 = st.tabs(["📤 Upload Bill Image", "✏️ Enter Manually"])

    with tab1:
        uploaded = st.file_uploader("Upload LESCO bill image", type=['jpg','jpeg','png','webp'])
        if uploaded:
            col1, col2 = st.columns([1, 1])
            with col1:
                st.image(uploaded, caption="Uploaded bill", width='stretch')
            with col2:
                if st.button("🔍 Extract Reference Number", type="primary", use_container_width=True):
                    from preprocess import get_variants
                    from ocr_engine import run_ocr
                    from ref_extractor import _search_lines as _ref_search
                    from collections import Counter as _Counter

                    img_bytes = uploaded.read()
                    _prog   = st.progress(0)
                    _status = st.empty()

                    try:
                        _status.caption("🔬 Preparing image variants…")
                        variants      = get_variants(img_bytes)
                        n             = len(variants)
                        hit_log: list = []
                        all_raw: list = []
                        v_run         = 0

                        for _i, (_vname, _img) in enumerate(variants):
                            _prog.progress(int(100 * _i / n))
                            _status.caption(
                                f"🔍 Variant {_i+1}/{n}: **{_vname}**"
                                + ("  ← header crop (fast)" if 'header' in _vname else "")
                            )
                            _lines = run_ocr(_img)
                            all_raw.extend(_lines)
                            v_run += 1
                            _ref = _ref_search(_lines)
                            if _ref:
                                hit_log.append((_ref, _vname))
                            # Early exit when 3 variants agree
                            if hit_log:
                                _best, _cnt = _Counter(r for r, _ in hit_log).most_common(1)[0]
                                if _cnt >= 3:
                                    _prog.progress(100)
                                    break

                        _prog.progress(100)
                        _status.empty()
                        _prog.empty()

                        if not hit_log:
                            result = {
                                'success': False, 'ref_no': None,
                                'confidence': 0.0, 'method': None,
                                'all_hits': [], 'raw_ocr': all_raw,
                                'variants_run': v_run,
                                'message': (
                                    "Could not extract the reference number.\n"
                                    "Tips:\n"
                                    "  • Ensure the bill is flat and well-lit.\n"
                                    "  • Make sure the 'REF NO' area is fully visible.\n"
                                    "  • Try a closer crop around the reference number.\n"
                                    "Or type the reference number in the Manual tab."
                                ),
                            }
                        else:
                            _vote = _Counter(r for r, _ in hit_log)
                            best_ref, _cnt = _vote.most_common(1)[0]
                            result = {
                                'success': True,
                                'ref_no': best_ref,
                                'confidence': round(_cnt / n, 2),
                                'method': next(m for r, m in hit_log if r == best_ref),
                                'all_hits': [r for r, _ in hit_log],
                                'raw_ocr': all_raw,
                                'variants_run': v_run,
                                'message': f"Reference number found: {best_ref}",
                            }

                    except Exception as _exc:
                        _prog.empty()
                        _status.empty()
                        st.error(f"❌ OCR error: {_exc}")
                        st.stop()

                    # ── Auto-save ref no immediately — no second click needed ─
                    if result['success']:
                        st.session_state.ref_no = result['ref_no']

                        _vrun = result.get('variants_run', '?')
                        st.success(
                            f"✅ **{result['ref_no']}** extracted "
                            f"({_vrun}/8 variants used, "
                            f"{result['confidence']:.0%} confidence)"
                        )

                        c1, c2, c3 = st.columns(3)
                        c1.metric("Reference Number", result['ref_no'])
                        c2.metric("Confidence",       f"{result['confidence']:.0%}")
                        c3.metric("Winning variant",  result['method'])

                        # Votes table
                        if result['all_hits']:
                            from collections import Counter
                            votes = Counter(result['all_hits'])
                            st.caption("Votes across variants:")
                            vote_df = pd.DataFrame(
                                [{'Candidate': k, 'Votes': v,
                                  'Selected': '✅' if k == result['ref_no'] else ''}
                                 for k, v in votes.most_common()]
                            )
                            st.dataframe(vote_df, hide_index=True, use_container_width=True)

                        # ── Auto-navigate prompt ──────────────────────────────
                        st.info(
                            "✅ Reference number saved to session automatically.  \n"
                            "👉 **Click 🌐 Module 3 — Fetcher in the sidebar** "
                            "to fetch your consumption history now."
                        )
                    else:
                        st.error("❌ Could not extract reference number")
                        st.warning(result['message'])
                        with st.expander("Raw OCR text (debug)"):
                            for line in result['raw_ocr'][:15]:
                                st.text(line)

    with tab2:
        st.markdown("If OCR fails or you know the reference number:")
        manual = st.text_input("Reference Number", value=st.session_state.ref_no,
                               placeholder="e.g. 08 11274 1172000U")
        if st.button("Save Reference Number", type="primary"):
            manual = manual.strip().upper()
            if len(manual.replace(' ', '')) == 15:
                st.session_state.ref_no = manual
                st.success(f"✅ Saved: {manual}")
            else:
                st.error("Invalid format. Should be 15 alphanumeric characters (e.g. 08 11274 1172000U)")


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 2 — MODULE 3: FETCHER
# ══════════════════════════════════════════════════════════════════════════════
elif page == "🌐 Module 3 — Fetcher":
    st.title("🌐 Module 3 — LESCO History Fetcher")
    st.markdown("Automatically fetches 12-month consumption history from the LESCO website.")

    ref = st.text_input("Reference Number", value=st.session_state.ref_no,
                        placeholder="e.g. 08 11274 1172000U")
    st.session_state.ref_no = ref.strip().upper()

    col1, col2 = st.columns([1, 3])
    with col1:
        fetch_btn = st.button("🚀 Fetch History", type="primary",
                              disabled=not bool(st.session_state.ref_no),
                              use_container_width=True)

    if fetch_btn:
        from fetcher import fetch as do_fetch, FetchError
        progress_area = st.empty()
        log_area      = st.empty()
        logs          = []

        def log(msg):
            logs.append(msg)
            log_area.code('\n'.join(logs[-10:]))

        with st.spinner("Launching browser, solving CAPTCHA, fetching history…"):
            try:
                import sys
                from io import StringIO
                import contextlib

                # Capture verbose output
                class StreamlitLogger:
                    def write(self, msg):
                        msg = msg.strip()
                        if msg:
                            log(msg)
                    def flush(self): pass

                old_stdout = sys.stdout
                sys.stdout = StreamlitLogger()
                try:
                    data = do_fetch(st.session_state.ref_no, headless=True, verbose=True)
                finally:
                    sys.stdout = old_stdout

                st.session_state.history_data = data
                st.session_state.prediction   = None  # reset on new fetch
                log_area.empty()
                st.success("✅ History fetched successfully!")

            except FetchError as e:
                sys.stdout = old_stdout
                st.error(f"❌ Fetch failed: {e}")
                st.stop()

    if st.session_state.history_data:
        data = st.session_state.history_data
        rows = data['raw_rows']

        st.divider()
        col1, col2, col3 = st.columns(3)
        col1.metric("Months Fetched",   len(rows))
        col2.metric("Latest Month",     data['latest_month'])
        col3.metric("Latest Units",     f"{data['latest_units']} u")

        # History table
        st.subheader("📋 Consumption & Payment History")
        df = pd.DataFrame(rows)[['month','units','bill','payment']]
        df.columns = ['Month','Units','Bill (Rs)','Payment (Rs)']
        st.dataframe(df, hide_index=True, use_container_width=True, height=420)

        # Charts
        st.subheader("📈 Visualisations")
        tab_u, tab_b, tab_both = st.tabs(["Units", "Bill (Rs)", "Units vs Bill"])

        with tab_u:
            fig = go.Figure()
            fig.add_trace(go.Bar(x=df['Month'], y=df['Units'],
                                 marker_color='steelblue', name='Units'))
            fig.add_hline(y=df['Units'].mean(), line_dash='dash',
                          annotation_text=f"Avg {df['Units'].mean():.0f}u",
                          line_color='orange')
            fig.update_layout(height=350, title="Monthly Units Consumed")
            st.plotly_chart(fig, use_container_width=True)

        with tab_b:
            fig = go.Figure()
            fig.add_trace(go.Bar(x=df['Month'], y=df['Bill (Rs)'],
                                 marker_color='tomato', name='Bill'))
            fig.update_layout(height=350, title="Monthly Bill Amount (Rs)")
            st.plotly_chart(fig, use_container_width=True)

        with tab_both:
            fig = go.Figure()
            fig.add_trace(go.Scatter(x=df['Month'], y=df['Units'],
                                     name='Units', yaxis='y1',
                                     line=dict(color='steelblue', width=2), mode='lines+markers'))
            fig.add_trace(go.Scatter(x=df['Month'], y=df['Bill (Rs)'],
                                     name='Bill (Rs)', yaxis='y2',
                                     line=dict(color='tomato', width=2, dash='dash'), mode='lines+markers'))
            fig.update_layout(
                height=400, title="Units vs Bill",
                yaxis=dict(title='Units', color='steelblue'),
                yaxis2=dict(title='Bill (Rs)', color='tomato', overlaying='y', side='right'),
            )
            st.plotly_chart(fig, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 3 — MODULE 1: PREDICTOR
# ══════════════════════════════════════════════════════════════════════════════
elif page == "📊 Module 1 — Predictor":
    st.title("📊 Module 1 — Bill Predictor")

    if not st.session_state.history_data:
        st.warning("⚠️ No history loaded yet. Go to **Module 3 — Fetcher** first.")
        st.stop()

    data = st.session_state.history_data
    history_units = data['history_units']

    st.subheader("Current Billing Cycle")
    col1, col2, col3 = st.columns(3)
    with col1:
        units_so_far = st.number_input("Units consumed so far", 0, 5000, value=100, step=1)
    with col2:
        days_elapsed = st.number_input("Days elapsed in cycle", 1, 31, value=15, step=1)
    with col3:
        total_days = st.number_input("Total cycle days", 28, 35, value=30, step=1)

    billing_day = st.number_input(
        "Billing cycle start day (default 1st of month)", 1, 28, value=1)

    if st.button("🔮 Run Prediction", type="primary"):
        from predictor import predict
        with st.spinner("Running all 6 models…"):
            result = predict(
                history_units    = history_units,
                units_so_far     = units_so_far,
                days_elapsed     = days_elapsed,
                total_cycle_days = total_days,
                **st.session_state.bill_kwargs,
            )
        st.session_state.prediction = result
        st.success("✅ Prediction complete!")

    if st.session_state.prediction:
        result = st.session_state.prediction
        pred   = result['prediction']
        bill   = pred['bill']
        conf   = result['confidence']
        bl     = result['blended']

        st.divider()

        # Top metrics
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Predicted Units",     f"{pred['units']} u")
        c2.metric("Estimated Bill",      f"Rs {bill['total_payable']:,.0f}")
        c3.metric("Primary Source",      conf['primary_source'])
        c4.metric("History / Projection", f"{conf['history_weight_pct']}% / {conf['projection_weight_pct']}%")

        # Confidence bar
        st.subheader("Confidence Blending")
        fig = go.Figure(go.Bar(
            x=[conf['history_weight_pct'], conf['projection_weight_pct']],
            y=['History', 'Daily Projection'],
            orientation='h',
            marker_color=['steelblue', 'tomato'],
            text=[f"{conf['history_weight_pct']}%", f"{conf['projection_weight_pct']}%"],
            textposition='inside',
        ))
        fig.update_layout(height=160, margin=dict(t=10, b=10))
        st.plotly_chart(fig, use_container_width=True)

        # Model comparison
        st.subheader("📋 Model Comparison")
        mc = result['model_comparison']
        rows_mc = []
        for name, d in mc.items():
            mae = d['loo_mae']
            rows_mc.append({
                'Model':           name,
                'Predicted Units': d['predicted_units'],
                'Est. Bill (Rs)':  f"Rs {d['predicted_pkr']:,.0f}",
                # Keep as string throughout so PyArrow sees a uniform object column
                'LOO MAE':         f"{mae:.1f}" if isinstance(mae, (int, float)) else str(mae),
                'Selected':        '✅' if name == result['best_historical']['name'] else '',
            })
        dp = result['daily_projection']
        rows_mc.append({
            'Model':           'Daily Projection',
            'Predicted Units': dp['predicted_units'],
            'Est. Bill (Rs)':  f"Rs {dp['predicted_pkr']:,.0f}",
            'LOO MAE':         '—',
            'Selected':        '✅' if 'Projection' in conf['primary_source'] else '',
        })
        st.dataframe(pd.DataFrame(rows_mc), hide_index=True, use_container_width=True)

        # History + Prediction chart
        st.subheader("📈 History + Forecast")
        hist_months = data['history_months']
        hist_units  = data['history_units']
        next_month  = "Next Month"

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=hist_months, y=hist_units,
            mode='lines+markers', name='Historical',
            line=dict(color='steelblue', width=2),
            marker=dict(size=7),
        ))
        fig.add_trace(go.Scatter(
            x=[hist_months[-1], next_month],
            y=[hist_units[-1], pred['units']],
            mode='lines+markers', name='Prediction',
            line=dict(color='tomato', width=2, dash='dash'),
            marker=dict(size=10, symbol='star'),
        ))
        fig.update_layout(height=380, title="Consumption History + Prediction")
        st.plotly_chart(fig, use_container_width=True)

        # Bill breakdown
        st.subheader("🧾 Predicted Bill Breakdown")
        col1, col2 = st.columns(2)
        with col1:
            breakdown = {
                'Energy Cost':     bill['energy_cost'],
                'Fixed Charge':    bill['fixed_charge'],
                'FPA':             bill['fpa'],
                'QTA':             bill['qta'],
                'Electricity Duty': bill['electricity_duty'],
                'TV Fee':          bill['tv_fee'],
                'GST':             bill['gst'],
                'GST on FPA':      bill['gst_on_fpa'],
                'Income Tax':      bill['income_tax'],
            }
            bd_df = pd.DataFrame([
                {'Component': k, 'Amount (Rs)': f"Rs {v:,.2f}"} for k, v in breakdown.items()
            ])
            st.dataframe(bd_df, hide_index=True, use_container_width=True)
        with col2:
            pos = {k: v for k, v in breakdown.items() if v > 0}
            fig = px.pie(values=list(pos.values()), names=list(pos.keys()),
                         title="Bill Components", hole=0.4)
            fig.update_layout(height=350)
            st.plotly_chart(fig, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 4 — MODULE 4: RECOMMENDER
# ══════════════════════════════════════════════════════════════════════════════
elif page == "💡 Module 4 — Recommender":
    st.title("💡 Module 4 — Appliance Recommender")

    if not st.session_state.prediction:
        st.warning("⚠️ No prediction yet. Go to **Module 1 — Predictor** first.")
        st.stop()

    from recommender import make_appliance, analyse, apply_reductions, suggest_to_meet_budget
    from appliances import DEFAULT_APPLIANCES, list_by_category

    pred_units = st.session_state.prediction['prediction']['units']
    pred_bill  = st.session_state.prediction['prediction']['bill']['total_payable']

    st.subheader("Predicted Bill")
    c1, c2 = st.columns(2)
    c1.metric("Predicted Units", f"{pred_units} u")
    c2.metric("Estimated Bill",  f"Rs {pred_bill:,.0f}")

    # ── Budget ────────────────────────────────────────────────────────────────
    st.divider()
    st.subheader("🎯 Set Your Budget")
    col1, col2 = st.columns(2)
    with col1:
        budget_pkr = st.number_input(
            "Max monthly bill (Rs)", 0, 100000,
            value=int(pred_bill * 0.75), step=500,
            help="Leave at 0 to ignore")
    with col2:
        budget_units = st.number_input(
            "Max monthly units", 0, 5000,
            value=int(pred_units * 0.8), step=10,
            help="Leave at 0 to ignore")
    budget_pkr   = budget_pkr   or None
    budget_units = budget_units or None
    # Keep budget in session so the AI Advisor can reference it
    st.session_state.budget_pkr   = budget_pkr
    st.session_state.budget_units = budget_units

    # ── Add appliances ────────────────────────────────────────────────────────
    st.divider()
    st.subheader("🔌 Your Appliances")

    add_tab, custom_tab = st.tabs(["Add from Database", "Add Custom Appliance"])

    with add_tab:
        categories = list_by_category()
        cat_sel  = st.selectbox("Category", sorted(categories.keys()))
        apps_in_cat = categories[cat_sel]
        app_names = [a['name'] for a in apps_in_cat]
        app_sel  = st.selectbox("Appliance", app_names)
        sel_app  = next(a for a in apps_in_cat if a['name'] == app_sel)
        st.caption(f"Wattage: **{sel_app['wattage_w']}W** — {sel_app.get('note','')}")
        col1, col2, col3 = st.columns(3)
        with col1: hrs_db = st.number_input("Hours/day", 0.5, 24.0, value=4.0, step=0.5, key='hrs_db')
        with col2: qty_db = st.number_input("Quantity",  1,   20,   value=1,   step=1,   key='qty_db')
        with col3: st.write("")
        if st.button("➕ Add Appliance", use_container_width=True):
            new_app = make_appliance(app_sel, sel_app['wattage_w'], hrs_db, qty_db, cat_sel)
            existing = [a['name'] for a in st.session_state.appliances]
            if app_sel in existing:
                st.warning(f"'{app_sel}' already added. Remove it first to re-add.")
            else:
                st.session_state.appliances.append(new_app)
                st.success(f"Added: {app_sel}")

    with custom_tab:
        col1, col2, col3, col4 = st.columns(4)
        with col1: c_name = st.text_input("Appliance name", placeholder="e.g. Washing Machine")
        with col2: c_watt = st.number_input("Wattage (W)", 1, 10000, value=500, step=50)
        with col3: c_hrs  = st.number_input("Hours/day", 0.5, 24.0, value=2.0, step=0.5, key='hrs_c')
        with col4: c_qty  = st.number_input("Quantity",  1,   20,   value=1,   step=1,   key='qty_c')
        if st.button("➕ Add Custom Appliance", use_container_width=True):
            if c_name.strip():
                st.session_state.appliances.append(
                    make_appliance(c_name.strip(), c_watt, c_hrs, c_qty, 'Custom'))
                st.success(f"Added: {c_name.strip()}")
            else:
                st.error("Enter an appliance name.")

    # Current appliance list
    if st.session_state.appliances:
        st.subheader("Current List")
        app_rows = []
        for i, a in enumerate(st.session_state.appliances):
            from recommender import appliance_monthly_units
            monthly_u = appliance_monthly_units(a)
            app_rows.append({
                '#':          i + 1,
                'Appliance':  a['name'],
                'W':          a['wattage_w'],
                'Hrs/day':    a['hours_per_day'],
                'Qty':        a['quantity'],
                'Units/month': round(monthly_u, 1),
            })
        app_df = pd.DataFrame(app_rows)
        st.dataframe(app_df, hide_index=True, use_container_width=True)

        col1, col2 = st.columns([1, 4])
        with col1:
            rm_idx = st.number_input("Remove #", 1, len(st.session_state.appliances), value=1, step=1)
        with col2:
            st.write("")
            if st.button("🗑️ Remove Selected"):
                st.session_state.appliances.pop(rm_idx - 1)
                st.rerun()
        if st.button("🗑️ Clear All Appliances"):
            st.session_state.appliances = []
            st.rerun()

    # ── Analysis & Recommendations ────────────────────────────────────────────
    if st.session_state.appliances:
        st.divider()
        st.subheader("📊 Recommendation Analysis")

        result = analyse(
            appliances      = st.session_state.appliances,
            predicted_units = pred_units,
            predicted_bill  = pred_bill,
            budget_pkr      = budget_pkr,
            budget_units    = budget_units,
            bill_kwargs     = st.session_state.bill_kwargs,
        )

        # Budget status
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("PKR Gap",         f"Rs {result['pkr_gap']:,.0f}" if result['pkr_gap'] > 0 else "Within budget")
        col2.metric("Units Gap",       f"{result['units_gap']} u" if result['units_gap'] > 0 else "Within budget")
        col3.metric("Units to save",   f"{result['units_to_save_for_pkr']} u")
        col4.metric("PKR Budget met?", "✅ Yes" if result['within_pkr_budget'] else "❌ No")

        # Ranked recommendations chart
        bd = result['appliance_breakdown']
        fig = go.Figure()
        fig.add_trace(go.Bar(
            y=[a['name'] for a in bd],
            x=[a['monthly_units'] for a in bd],
            orientation='h',
            marker_color=['gold' if a['slab_at_1hr'] else 'steelblue' for a in bd],
            text=[f"{a['monthly_units']:.0f}u  Rs{a['bill_drop_per_1hr']:,.0f}/hr" for a in bd],
            textposition='inside',
        ))
        fig.update_layout(
            height=max(300, len(bd) * 42),
            title="Appliances Ranked by Impact (Gold = crosses slab boundary)",
            xaxis_title="Monthly Units",
        )
        st.plotly_chart(fig, use_container_width=True)

        # ── Auto-suggest ──────────────────────────────────────────────────────
        if not result['within_pkr_budget'] or not result['within_units_budget']:
            st.subheader("🤖 Auto-Suggested Reductions")
            suggestions = suggest_to_meet_budget(
                appliances      = st.session_state.appliances,
                predicted_units = pred_units,
                bill_kwargs     = st.session_state.bill_kwargs,
                budget_pkr      = budget_pkr,
                budget_units    = budget_units,
            )
            if suggestions:
                sug_df = pd.DataFrame([{
                    'Appliance':       s['name'],
                    'Cut (hrs/day)':   s['hours_reduced'],
                    'Units Saved':     s['units_saved'],
                    'New Total Units': s['new_total_units'],
                    'New Bill (Rs)':   f"Rs {s['new_bill']:,.0f}",
                } for s in suggestions])
                st.dataframe(sug_df, hide_index=True, use_container_width=True)
            else:
                st.info("Already within budget!")

        # ── Manual reductions ─────────────────────────────────────────────────
        st.divider()
        st.subheader("🎛️ Manual Reduction Simulator")
        st.caption("Adjust sliders to see the real-time impact on your predicted bill.")

        reductions = []
        cols = st.columns(min(3, len(st.session_state.appliances)))
        for i, app in enumerate(st.session_state.appliances):
            with cols[i % 3]:
                hrs_cut = st.slider(
                    f"Cut {app['name'][:20]}",
                    min_value=0.0,
                    max_value=float(app['hours_per_day']),
                    value=0.0, step=0.5,
                    key=f"slider_{i}",
                )
                if hrs_cut > 0:
                    reductions.append({'name': app['name'], 'hours_reduced': hrs_cut})

        if reductions:
            sim = apply_reductions(
                appliances      = st.session_state.appliances,
                reductions      = reductions,
                predicted_units = pred_units,
                bill_kwargs     = st.session_state.bill_kwargs,
                budget_pkr      = budget_pkr,
                budget_units    = budget_units,
            )

            st.divider()
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Final Units",  f"{sim['final_units']} u",
                      delta=f"-{sim['total_units_saved']:.0f} u")
            c2.metric("Final Bill",   f"Rs {sim['final_bill']:,.0f}",
                      delta=f"-Rs {sim['total_pkr_saved']:,.0f}")
            c3.metric("PKR Budget",   "✅ Met" if sim['meets_pkr_budget']   else "❌ Not met")
            c4.metric("Unit Budget",  "✅ Met" if sim['meets_units_budget'] else "❌ Not met")

            for step in sim['steps']:
                msg = f"**{step['appliance']}** — cut {step['hours_reduced']}h/day → save {step['units_saved']:.0f} units, Rs {step['money_saved_step']:,.0f}"
                if step['slab_crossed']:
                    st.success(f"⚡ {msg}  ← **Slab boundary crossed! Bonus saving!**")
                else:
                    st.info(f"• {msg}")
        else:
            st.info("Move a slider above to simulate a reduction.")

        # ── Quick link to AI Advisor ──────────────────────────────────────────
        st.divider()
        st.caption("💬 Want deeper advice?  Switch to **🤖 AI Advisor** in the sidebar "
                   "to chat with an AI that knows your full consumption profile.")


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 5 — AI ADVISOR  (Groq-powered chatbot)
# ══════════════════════════════════════════════════════════════════════════════
elif page == "🤖 AI Advisor":
    from chatbot import build_context, chat as groq_chat, STARTER_PROMPTS

    st.title("🤖 AI Electricity Advisor")
    st.markdown(
        "Powered by **Groq · Llama-3.3-70B**. "
        "The AI knows your real consumption history, appliances, prediction, "
        "and budget — every answer is personalised to your account."
    )

    # ── Context assembly (per-user tuning) ────────────────────────────────────
    s = st.session_state

    # Build auto-suggestions if we have enough data
    _ai_recs: list = []
    if s.appliances and s.prediction:
        try:
            from recommender import suggest_to_meet_budget as _stmb
            _ai_recs = _stmb(
                appliances      = s.appliances,
                predicted_units = s.prediction['prediction']['units'],
                bill_kwargs     = s.bill_kwargs,
                budget_pkr      = s.budget_pkr,
                budget_units    = s.budget_units,
            )
        except Exception:
            _ai_recs = []

    _ctx = build_context(
        ref_no       = s.ref_no       or None,
        bill_kwargs  = s.bill_kwargs,
        history_data = s.history_data,
        prediction   = s.prediction,
        appliances   = s.appliances,
        budget_pkr   = s.budget_pkr,
        budget_units = s.budget_units,
    )

    # ── Data status banner ────────────────────────────────────────────────────
    with st.expander("📋 Context loaded into AI  (click to inspect)", expanded=False):
        col_a, col_b, col_c, col_d = st.columns(4)
        col_a.metric("Account",    s.ref_no if s.ref_no else "—")
        col_b.metric("History",    f"{len(s.history_data['history_units'])} months"
                                   if s.history_data else "—")
        col_c.metric("Prediction", f"{s.prediction['prediction']['units']} u"
                                   if s.prediction else "—")
        col_d.metric("Appliances", f"{len(s.appliances)} items"
                                   if s.appliances else "—")

        missing = []
        if not s.ref_no:      missing.append("ref no (Module 2 or 3)")
        if not s.history_data: missing.append("consumption history (Module 3)")
        if not s.prediction:   missing.append("prediction (Module 1)")
        if not s.appliances:   missing.append("appliances (Module 4)")
        if missing:
            st.warning("⚠️ Richer answers come with more data. Missing: " +
                       " · ".join(missing))
        else:
            st.success("✅ Full context loaded — AI has your complete profile!")

    st.divider()

    # ── Starter prompt chips ──────────────────────────────────────────────────
    if not s.chat_history:
        st.markdown("**Not sure what to ask? Try one of these:**")
        chip_cols = st.columns(3)
        for _ci, _sp in enumerate(STARTER_PROMPTS):
            with chip_cols[_ci % 3]:
                if st.button(_sp, key=f"starter_{_ci}", use_container_width=True):
                    st.session_state.chat_history.append(
                        {"role": "user", "content": _sp}
                    )
                    st.rerun()
        st.divider()

    # ── Conversation history display ──────────────────────────────────────────
    for _msg in s.chat_history:
        with st.chat_message(_msg["role"],
                             avatar="🧑" if _msg["role"] == "user" else "⚡"):
            st.markdown(_msg["content"])

    # ── Generate AI reply for the latest unanswered user message ─────────────
    if s.chat_history and s.chat_history[-1]["role"] == "user":
        with st.chat_message("assistant", avatar="⚡"):
            _placeholder = st.empty()
            _full_reply  = ""
            try:
                with st.spinner(""):
                    for _chunk in groq_chat(s.chat_history, _ctx, stream=True):
                        _full_reply += _chunk
                        _placeholder.markdown(_full_reply + "▌")
                _placeholder.markdown(_full_reply)
            except Exception as _e:
                _placeholder.error(f"❌ Groq API error: {_e}")
                _full_reply = f"[Error: {_e}]"

        s.chat_history.append({"role": "assistant", "content": _full_reply})

    # ── Chat input box (always at bottom) ────────────────────────────────────
    _user_input = st.chat_input(
        "Ask anything about your electricity bill, appliances, or savings…"
    )
    if _user_input:
        st.session_state.chat_history.append(
            {"role": "user", "content": _user_input.strip()}
        )
        st.rerun()

    # ── Sidebar controls for this page ───────────────────────────────────────
    with st.sidebar:
        st.divider()
        st.subheader("💬 Chat Controls")
        if st.button("🗑️ Clear conversation", use_container_width=True):
            st.session_state.chat_history = []
            st.rerun()
        st.caption(f"Model: `{__import__('chatbot').MODEL}`")
        st.caption(f"Messages in history: {len(s.chat_history)}")
