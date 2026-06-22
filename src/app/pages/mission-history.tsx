import { Link } from "react-router";
import { CalendarClock, MapPin } from "lucide-react";
import { generateBalloonHistory, STATIONS } from "../data/radiosonde-data";

export function MissionHistoryPage() {
  const station = STATIONS[0];
  const records = generateBalloonHistory(station.id, 14);

  return (
    <section className="w-full p-6">
      <div className="max-w-6xl space-y-6">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
          Missions
        </p>
        <div>
          <h2 className="mt-2 text-2xl font-semibold">Mission History</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Current station history for {station.name}. These entries match the
            Mumbai radiosonde history used by the dashboard.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => (
            <Link
              key={record.id}
              to={`/?station=${record.stationId}&date=${record.date}&time=${record.time}`}
              className="rounded-lg border border-border/60 bg-card/35 p-4 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{record.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {record.date} at {record.time} UTC
                  </div>
                </div>
                <CalendarClock className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {station.name} · {record.stationId}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
