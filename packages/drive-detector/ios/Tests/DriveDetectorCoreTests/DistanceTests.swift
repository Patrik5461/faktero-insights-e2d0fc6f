import XCTest
@testable import DriveDetectorCore

final class DistanceTests: XCTestCase {
    private func bod(_ lat: Double, _ lng: Double, cas: TimeInterval = 0, speed: Double = 0) -> TripPoint {
        TripPoint(lat: lat, lng: lng, speedKmh: speed, accuracy: 10, altitude: nil, timestamp: cas)
    }

    func testVzdialenostMedziDvomaBodmi() {
        // Bratislava → Trnava je vzdušnou čiarou zhruba 45 km.
        let bratislava = bod(48.1486, 17.1077)
        let trnava = bod(48.3774, 17.5872)
        let metre = Distance.meters(from: bratislava, to: trnava)

        XCTAssertEqual(metre, 45_000, accuracy: 2_000)
    }

    func testRovnakyBodJeNulovaVzdialenost() {
        XCTAssertEqual(Distance.meters(from: bod(48.15, 17.11), to: bod(48.15, 17.11)), 0)
    }

    func testSucetTrasy() {
        let body = [bod(48.150, 17.110), bod(48.151, 17.110), bod(48.152, 17.110)]
        // Stotina stupňa zemepisnej šírky je asi 111 metrov.
        XCTAssertEqual(Distance.total(of: body), 222, accuracy: 5)
    }

    func testJedinyBodNemaVzdialenost() {
        XCTAssertEqual(Distance.total(of: [bod(48.15, 17.11)]), 0)
        XCTAssertEqual(Distance.total(of: []), 0)
    }

    func testPriemernaRychlostSaPocitaZTrasyACasu() {
        // 45 km za pol hodinu = 90 km/h.
        var jazda = BufferedTrip(id: "x", startedAt: 0, endedAt: 1_800)
        jazda.distanceMeters = 45_000

        XCTAssertEqual(jazda.avgSpeedKmh, 90, accuracy: 0.1)
    }

    func testPriemernaRychlostBezTrvaniaJeNula() {
        let jazda = BufferedTrip(id: "x", startedAt: 100, endedAt: 100, distanceMeters: 500)
        XCTAssertEqual(jazda.avgSpeedKmh, 0)
    }

    func testSkokPolohySaDoTrasyNezapocita() {
        // Dva úseky po ~111 m za 10 s (40 km/h) a medzi nimi skok o 2 km tam a späť.
        let body = [
            bod(48.150, 17.110, cas: 0, speed: 40),
            bod(48.151, 17.110, cas: 10, speed: 40),
            bod(48.170, 17.110, cas: 20, speed: 40),
            bod(48.152, 17.110, cas: 30, speed: 40),
            bod(48.153, 17.110, cas: 40, speed: 40),
        ]
        XCTAssertEqual(Distance.total(of: body), 222, accuracy: 5)
    }

    func testNezmyselnaRychlostSaDoNajvyssejNepocita() {
        let body = [bod(48.150, 17.110, cas: 0, speed: 50), bod(48.151, 17.110, cas: 10, speed: 400)]
        XCTAssertEqual(Distance.maxSpeed(of: body), 50)
    }
}
