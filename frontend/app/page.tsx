import MapPanel from "../components/MapPanel";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">DanubeGuard OS</p>
        <h1>Pollution Monitoring & Prevention for the Danube</h1>
        <p className="hero-copy">
          Satellite-derived risk indicators, NGO sensor measurements, and citizen science reports in one geospatial
          command center.
        </p>
      </section>

      <MapPanel />
    </main>
  );
}