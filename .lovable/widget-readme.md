# Home Screen Widget — Faktero

Capacitor 7 zatiaľ **nemá oficiálny first-party widget plugin**, ktorý by
fungoval out-of-the-box na oboch platformách. Komunitný
`@capacitor-community/app-widget` rieši len Android (a aj to čiastočne).

**Odporúčaný postup: natívny widget + zdieľaná `App Group` / `SharedPreferences`
data store.** Faktero appka pri každom otvorení uloží sumár (počet faktúr,
celkovú sumu, počet po splatnosti) do zdieľaného úložiska a widget ho číta.

## 1. Endpoint pre widget data

`GET /api/v1/dashboard/widget-summary` (chránený API kľúčom) vracia:

```json
{
  "unpaid_count": 3,
  "unpaid_total": 1250.5,
  "currency": "EUR",
  "overdue_count": 1
}
```

Pre widget je jednoduchšie, aby si appka tento JSON sama pri každom
`appResume` evente uložila do zdieľaného storage — widget potom nemusí robiť
sieťové volania (a nemusíš riešiť auth v rozšírení).

## 2. iOS — WidgetKit (Swift)

V Xcode:

1. **File → New → Target → Widget Extension** (názov `FakteroWidget`)
2. V hlavnej app a vo widget targete pridaj rovnakú **App Group**
   (Signing & Capabilities → +Capability → App Groups → `group.sk.tobify.faktero`)
3. V hlavnej appke (Capacitor wrapper) implementuj plugin, ktorý pri každom
   foreground evente zapíše JSON do `UserDefaults(suiteName: "group.sk.tobify.faktero")`.
4. Widget `Provider.getTimeline` číta JSON, vracia `TimelineEntry` s
   `policy: .after(Date().addingTimeInterval(30 * 60))` → refresh každých 30 min.
5. Widget view (SwiftUI):

```swift
struct FakteroWidgetView: View {
    let entry: SummaryEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(entry.unpaidCount) faktúry").font(.headline)
            Text("\(entry.unpaidTotal, format: .currency(code: entry.currency))")
                .font(.title2).bold()
            if entry.overdueCount > 0 {
                Text("\(entry.overdueCount) po splatnosti")
                    .foregroundColor(.red).font(.caption)
            }
        }.padding()
    }
}
```

6. Submit widget extension spolu s hlavnou appkou (jeden archive).

## 3. Android — App Widget Provider (Kotlin)

1. `android/app/src/main/res/xml/faktero_widget_info.xml`:

```xml
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="80dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/faktero_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"/>
```

2. `android/app/src/main/res/layout/faktero_widget.xml` — `LinearLayout`
   s `TextView` pre počet, sumu, badge "po splatnosti".

3. `android/app/src/main/java/sk/faktero/app/FakteroWidget.kt`:

```kotlin
class FakteroWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        val prefs = ctx.getSharedPreferences("FakteroWidget", Context.MODE_PRIVATE)
        val count = prefs.getInt("unpaid_count", 0)
        val total = prefs.getString("unpaid_total", "0.00 €")
        val overdue = prefs.getInt("overdue_count", 0)

        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.faktero_widget)
            v.setTextViewText(R.id.widget_count, "$count faktúr")
            v.setTextViewText(R.id.widget_total, total)
            v.setTextViewText(R.id.widget_overdue, if (overdue > 0) "$overdue po splatnosti" else "")
            mgr.updateAppWidget(id, v)
        }
    }
}
```

4. V `AndroidManifest.xml`:

```xml
<receiver android:name=".FakteroWidget" android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE"/>
    </intent-filter>
    <meta-data android:name="android.appwidget.provider"
        android:resource="@xml/faktero_widget_info"/>
</receiver>
```

5. V appke (Capacitor plugin) pri každom resume zapíš do
   `SharedPreferences("FakteroWidget", MODE_PRIVATE)` a zavolaj
   `AppWidgetManager.getInstance(ctx).notifyAppWidgetViewDataChanged(...)`.

## Záver

**Capacitor plugin pre widget neexistuje v stabilnej podobe** — widget musíš
implementovať natívne. Web/TypeScript časť appky vie len pripraviť dáta;
zobrazovaciu vrstvu (Swift + Kotlin) píšeš priamo v Xcode / Android Studio.
