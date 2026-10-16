from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_notificationlog_call_sid_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notificationlog",
            name="call_sid",
            field=models.CharField(
                blank=True,
                help_text="Voice provider's id for this call (Plivo request id; older rows hold a Twilio CallSid). Populated only for the Voice Call channel.",
                max_length=64,
            ),
        ),
    ]