from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="billing_cycle_day",
            field=models.IntegerField(
                default=1,
                help_text="Day of month the billing cycle starts (1–28). Default 1 = standard LESCO cycle.",
            ),
        ),
    ]
