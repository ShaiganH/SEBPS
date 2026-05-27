import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("budget", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CycleSummary",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="cycle_summaries",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("cycle_start",      models.DateField(help_text="First day of the completed cycle")),
                ("cycle_end",        models.DateField(help_text="Last day of the completed cycle (day before new cycle)")),
                ("total_cycle_days", models.IntegerField()),
                ("budget_pkr",       models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True,
                                     help_text="User's monthly PKR budget for this cycle")),
                ("iot_units_kwh",    models.FloatField(blank=True, null=True)),
                ("iot_bill_pkr",     models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("bill_units",       models.IntegerField(blank=True, null=True)),
                ("bill_amount_pkr",  models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("predicted_units",    models.IntegerField(blank=True, null=True)),
                ("predicted_bill_pkr", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("savings_pkr",      models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True,
                                     help_text="Positive = spent less than budget; negative = overspent")),
                ("created_at",       models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "cycle_summaries",
                "ordering": ["-cycle_start"],
                "unique_together": {("user", "cycle_start")},
            },
        ),
    ]
