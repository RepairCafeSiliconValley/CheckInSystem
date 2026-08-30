// Cross-event time-series for the Metrics tab. Loaded lazily so recharts lands
// in its own Vite chunk — the public /checkin and /fix pages never pay for it.
//
// Three separate plots, deliberately never combined: counts, fix rate and
// kilograms are three different scales, and a dual-axis chart would invent a
// correlation that isn't in the data. Counts and weight are per-event magnitude
// comparisons (bars); fix rate is a trend (line).
//
// Note the y-axis margins are 0, not negative. A negative left margin shifts
// the plot outside the SVG and silently clips wide tick labels — "100kg"
// renders as "0kg". Each axis is instead sized for its widest realistic label.
//
// Series colors are validated for CVD separation and contrast on a white card.
// #3a6fce is a lighter, more chromatic sibling of the app's #1e3a6e navy — the
// navy itself is too dark and too gray to read as a chart fill.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BLUE = "#3a6fce";
const CORAL = "#e07850";
const GREEN = "#2e7d32";

const AXIS = { fontFamily: "'Outfit', sans-serif", fontSize: 11, fill: "#667085" };
const GRID = "#eef0f4";

function ChartFrame({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "13px",
          fontWeight: 700,
          color: "#344054",
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "11px",
            color: "#98a2b3",
            marginBottom: 6,
          }}
        >
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid #e8ebf0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  labelStyle: { color: "#1d2939", fontWeight: 700 },
};

/**
 * @param data [{ name, date, clients, items, fixRate }] oldest first
 */
export default function MetricsCharts({ data }) {
  if (!data || data.length < 2) return null;

  const rateData = data.filter((d) => d.fixRate !== null);
  // Only events that actually recorded weight; kg is a third unit, so it gets
  // its own plot rather than being stacked onto the counts chart.
  const weightData = data.filter((d) => d.kg > 0);

  return (
    <div>
      <ChartFrame title="Clients and items per event" subtitle="Oldest to newest">
        {/* Height includes the x-axis band so labels are never clipped. */}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
            <Tooltip cursor={{ fill: "#f8f9fb" }} {...tooltipStyle} />
            <Legend wrapperStyle={{ fontFamily: "'Outfit', sans-serif", fontSize: 11 }} />
            <Bar dataKey="clients" name="Clients" fill={BLUE} maxBarSize={20} radius={[3, 3, 0, 0]} />
            <Bar dataKey="items" name="Items" fill={CORAL} maxBarSize={20} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      {rateData.length >= 2 && (
        <ChartFrame title="Fix rate over time" subtitle="Share of completed items marked Fixed">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rateData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip formatter={(v) => `${Math.round(v)}%`} {...tooltipStyle} />
              <Line
                type="monotone"
                dataKey="fixRate"
                name="Fix rate"
                stroke={GREEN}
                strokeWidth={2}
                dot={{ r: 4, fill: GREEN, stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: GREEN, stroke: "#fff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}

      {weightData.length >= 2 && (
        <ChartFrame title="Weight collected per event" subtitle="Kilograms of items brought in">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weightData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="name"
                tick={AXIS}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v) => `${v}kg`}
              />
              <Tooltip
                cursor={{ fill: "#f8f9fb" }}
                formatter={(v) => `${Number(v).toFixed(1)} kg`}
                {...tooltipStyle}
              />
              {/* Single series — the title names it, so no legend box. */}
              <Bar dataKey="kg" name="Weight" fill={BLUE} maxBarSize={20} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}
    </div>
  );
}

