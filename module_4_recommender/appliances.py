"""
Default Pakistani household appliance database.
Wattages based on typical appliances available in Pakistan (2024-25).

Each entry:  name → { wattage_w, category, note }

Users can add custom appliances on top of these defaults.
"""

DEFAULT_APPLIANCES: dict[str, dict] = {
    # ── Cooling ───────────────────────────────────────────────────────────────
    'Air Conditioner (1 ton)':      {'wattage_w': 1000, 'category': 'Cooling',
                                     'note': 'Typical 1-ton split AC (non-inverter)'},
    'Air Conditioner (1.5 ton)':    {'wattage_w': 1500, 'category': 'Cooling',
                                     'note': 'Typical 1.5-ton split AC'},
    'Air Conditioner (2 ton)':      {'wattage_w': 2000, 'category': 'Cooling',
                                     'note': '2-ton AC, large rooms'},
    'Inverter AC (1 ton)':          {'wattage_w': 700,  'category': 'Cooling',
                                     'note': 'Inverter type uses ~30% less power'},
    'Inverter AC (1.5 ton)':        {'wattage_w': 1050, 'category': 'Cooling',
                                     'note': 'Inverter 1.5-ton'},
    'Ceiling Fan':                  {'wattage_w': 75,   'category': 'Cooling',
                                     'note': 'Standard ceiling fan'},
    'Pedestal Fan':                 {'wattage_w': 60,   'category': 'Cooling',
                                     'note': 'Standing/table fan'},
    'Exhaust Fan':                  {'wattage_w': 30,   'category': 'Cooling',
                                     'note': 'Bathroom/kitchen exhaust'},

    # ── Heating ───────────────────────────────────────────────────────────────
    'Electric Geyser (small)':      {'wattage_w': 1500, 'category': 'Heating',
                                     'note': '10-15 litre instant geyser'},
    'Electric Geyser (large)':      {'wattage_w': 3000, 'category': 'Heating',
                                     'note': '25-50 litre storage geyser'},
    'Instant Geyser':               {'wattage_w': 3500, 'category': 'Heating',
                                     'note': 'Instant water heater'},
    'Room Heater (fan)':            {'wattage_w': 2000, 'category': 'Heating',
                                     'note': 'Fan/blower type room heater'},
    'Room Heater (oil)':            {'wattage_w': 2500, 'category': 'Heating',
                                     'note': 'Oil-filled radiator heater'},
    'Electric Blanket':             {'wattage_w': 100,  'category': 'Heating',
                                     'note': 'Electric warming blanket'},

    # ── Kitchen ───────────────────────────────────────────────────────────────
    'Refrigerator (small)':         {'wattage_w': 100,  'category': 'Kitchen',
                                     'note': 'Small fridge ~8 cu ft, runs 24h'},
    'Refrigerator (large)':         {'wattage_w': 200,  'category': 'Kitchen',
                                     'note': 'Large fridge/freezer combo'},
    'Deep Freezer':                 {'wattage_w': 150,  'category': 'Kitchen',
                                     'note': 'Chest/upright freezer'},
    'Microwave Oven':               {'wattage_w': 1000, 'category': 'Kitchen',
                                     'note': 'Standard 20-30L microwave'},
    'Electric Kettle':              {'wattage_w': 1500, 'category': 'Kitchen',
                                     'note': '1.5-2L kettle, ~15 min use'},
    'Electric Stove (1 burner)':    {'wattage_w': 1000, 'category': 'Kitchen',
                                     'note': 'Single coil/induction burner'},
    'Electric Stove (2 burners)':   {'wattage_w': 2000, 'category': 'Kitchen',
                                     'note': 'Double coil/induction'},
    'Rice Cooker':                  {'wattage_w': 700,  'category': 'Kitchen',
                                     'note': 'Standard 1.8L rice cooker'},
    'Water Dispenser (hot+cold)':   {'wattage_w': 500,  'category': 'Kitchen',
                                     'note': 'Compressor-type dispenser'},

    # ── Laundry ───────────────────────────────────────────────────────────────
    'Washing Machine (semi-auto)':  {'wattage_w': 300,  'category': 'Laundry',
                                     'note': 'Twin-tub semi-automatic'},
    'Washing Machine (auto)':       {'wattage_w': 500,  'category': 'Laundry',
                                     'note': 'Fully automatic front/top load'},
    'Iron':                         {'wattage_w': 1000, 'category': 'Laundry',
                                     'note': 'Standard dry/steam iron'},

    # ── Entertainment ─────────────────────────────────────────────────────────
    'LED TV (32")':                 {'wattage_w': 40,   'category': 'Entertainment',
                                     'note': '32-inch LED television'},
    'LED TV (43")':                 {'wattage_w': 70,   'category': 'Entertainment',
                                     'note': '43-inch LED television'},
    'LED TV (55")':                 {'wattage_w': 100,  'category': 'Entertainment',
                                     'note': '55-inch 4K LED television'},

    # ── Office / Work ─────────────────────────────────────────────────────────
    'Desktop Computer':             {'wattage_w': 200,  'category': 'Office',
                                     'note': 'PC with monitor'},
    'Laptop':                       {'wattage_w': 65,   'category': 'Office',
                                     'note': 'Standard laptop'},
    'WiFi Router':                  {'wattage_w': 10,   'category': 'Office',
                                     'note': 'Broadband router, runs 24h'},
    'Printer':                      {'wattage_w': 50,   'category': 'Office',
                                     'note': 'Inkjet/laser printer (idle)'},

    # ── Lighting ──────────────────────────────────────────────────────────────
    'LED Bulb (9W)':                {'wattage_w': 9,    'category': 'Lighting',
                                     'note': 'Standard LED bulb'},
    'LED Bulb (18W)':               {'wattage_w': 18,   'category': 'Lighting',
                                     'note': 'Bright LED bulb'},
    'LED Tube Light (20W)':         {'wattage_w': 20,   'category': 'Lighting',
                                     'note': '4ft LED tube'},
    'CFL Bulb (23W)':               {'wattage_w': 23,   'category': 'Lighting',
                                     'note': 'Older CFL (consider replacing with LED)'},

    # ── Utility ───────────────────────────────────────────────────────────────
    'Water Pump (0.5 HP)':          {'wattage_w': 375,  'category': 'Utility',
                                     'note': 'Small submersible/surface pump'},
    'Water Pump (1 HP)':            {'wattage_w': 750,  'category': 'Utility',
                                     'note': 'Standard 1 HP water pump'},
    'Water Pump (1.5 HP)':          {'wattage_w': 1100, 'category': 'Utility',
                                     'note': '1.5 HP pump'},
    'Inverter/UPS (1 kVA)':         {'wattage_w': 800,  'category': 'Utility',
                                     'note': 'Home UPS charging load'},
    'CCTV System (4 cameras)':      {'wattage_w': 60,   'category': 'Utility',
                                     'note': '4-camera DVR system, runs 24h'},
}


def get_appliance(name: str) -> dict | None:
    """Look up a default appliance by name (case-insensitive)."""
    name_lower = name.lower()
    for key, val in DEFAULT_APPLIANCES.items():
        if key.lower() == name_lower:
            return {'name': key, **val}
    return None


def search_appliances(keyword: str) -> list[dict]:
    """Search appliances by keyword in name or category."""
    kw = keyword.lower()
    return [
        {'name': k, **v}
        for k, v in DEFAULT_APPLIANCES.items()
        if kw in k.lower() or kw in v['category'].lower()
    ]


def list_by_category() -> dict[str, list[dict]]:
    """Return appliances grouped by category."""
    grouped: dict[str, list] = {}
    for name, data in DEFAULT_APPLIANCES.items():
        cat = data['category']
        grouped.setdefault(cat, [])
        grouped[cat].append({'name': name, **data})
    return grouped
