import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

/**
 Kreslenie prúžku „Nahrávam jazdu".

 Je to samostatný program (rozšírenie appky) — iOS ho spustí, keď má prúžok
 vykresliť, a s appkou nezdieľa nič okrem typu `DriveActivityAttributes`,
 ktorý je preto v oboch cieľoch naraz.

 Texty sú po slovensky priamo tu. Je to obrazovka appky, nie plugin: v plugine
 by slovenčina nemala čo hľadať, tu je na mieste rovnako ako v storyboarde.
 */

@main
struct FakteroDriveActivityBundle: WidgetBundle {
    var body: some Widget {
        DriveActivityWidget()
    }
}

struct DriveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DriveActivityAttributes.self) { kontext in
            // Uzamknutá obrazovka a staršie telefóny bez Dynamic Islandu.
            HStack(spacing: 12) {
                Image(systemName: "car.fill")
                    .font(.title3)
                    .foregroundColor(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Nahrávam jazdu")
                        .font(.headline)
                    HStack(spacing: 6) {
                        // Čas beží sám — `style: .timer` si prekresľuje systém,
                        // takže sa naň nemíňajú obnovenia z denného stropu.
                        Text(kontext.state.zaciatok, style: .timer)
                            .monospacedDigit()
                        Text("·")
                        Text(popis(rucna: kontext.attributes.rucna))
                    }
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                }
                Spacer()
                Text(kilometre(kontext.state.kilometre))
                    .font(.title2.monospacedDigit())
                    .fontWeight(.semibold)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.75))
            .activitySystemActionForegroundColor(.white)

        } dynamicIsland: { kontext in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Jazda", systemImage: "car.fill")
                        .font(.caption)
                        .foregroundColor(.green)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(kilometre(kontext.state.kilometre))
                        .font(.headline.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 6) {
                        Text(kontext.state.zaciatok, style: .timer).monospacedDigit()
                        Text("·")
                        Text(popis(rucna: kontext.attributes.rucna))
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
            } compactLeading: {
                Image(systemName: "car.fill").foregroundColor(.green)
            } compactTrailing: {
                Text(kilometre(kontext.state.kilometre)).monospacedDigit()
            } minimal: {
                Image(systemName: "car.fill").foregroundColor(.green)
            }
        }
    }

    /// „12,4 km" — desatinná čiarka, ako sa u nás píše.
    private func kilometre(_ km: Double) -> String {
        String(format: "%.1f km", km).replacingOccurrences(of: ".", with: ",")
    }

    /// Odkiaľ sa jazda vzala — nech je jasné, či ju spustila detekcia.
    private func popis(rucna: Bool) -> String {
        rucna ? "spustená ručne" : "rozpoznaná jazda"
    }
}
