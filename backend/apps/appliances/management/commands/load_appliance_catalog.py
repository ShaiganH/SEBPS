"""
Management command: python manage.py load_appliance_catalog
Seeds ApplianceCatalog from module_4_recommender/appliances.py
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed the appliance catalog from module_4_recommender/appliances.py"

    def handle(self, *args, **options):
        try:
            from appliances import DEFAULT_APPLIANCES  # module_4_recommender/appliances.py
        except ImportError:
            self.stderr.write("Could not import appliances module. Check RECOMMENDER_MODULE_PATH.")
            return

        from apps.appliances.models import ApplianceCatalog

        # DEFAULT_APPLIANCES is a dict: { "Name": {"wattage_w": X, "category": Y, "note": Z} }
        created = 0
        for name, attrs in DEFAULT_APPLIANCES.items():
            _, was_created = ApplianceCatalog.objects.update_or_create(
                name=name,
                defaults={
                    "category": attrs.get("category", "General"),
                    "wattage_w": attrs["wattage_w"],
                    "typical_hours_per_day": attrs.get("typical_hours_per_day", 0),
                    "description": attrs.get("note", ""),
                },
            )
            if was_created:
                created += 1

        total = len(DEFAULT_APPLIANCES)
        self.stdout.write(
            self.style.SUCCESS(
                f"Appliance catalog loaded: {created} new, {total - created} updated ({total} total)."
            )
        )
