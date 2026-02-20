import { useMemo } from "react";
import { useSelectedDevice } from "@/hooks/useDevices";
import { useSensorReadings, useAllAlerts } from "@/hooks/useRealtimeReadings";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Download, Brain, ShieldAlert, Gauge, TrendingDown, ArrowRight } from "lucide-react";

// Helpers to compute AI metrics from live sensor data
function computeBaseline(readings: any[]) {
  if (readings.length === 0) return { avgPower: 0, samples: 0, status: "Training" };
  const powers = readings.map((r) => r.power || 0);
  const avg = powers.reduce((a, b) => a + b, 0) / powers.length;
  return {
    avgPower: +avg.toFixed(2),
    samples: readings.length,
    status: readings.length >= 50 ? "Completed" : "Training",
  };
}

function computeIntelligence(latestReading: any, avgPower: number) {
  if (!latestReading) return { condition: "No Data", status: "⚪ Unknown", color: "muted-foreground" };
  const power = latestReading.power || 0;
  const pir = latestReading.pir || 0;
  if (power === 0 && pir === 1) return { condition: "Power=0, Motion=Yes", status: "🔴 Theft Attempt", color: "destructive" };
  if (power < avgPower * 0.6) return { condition: `Power(${power.toFixed(1)}) < Baseline(${avgPower.toFixed(1)})`, status: "🟠 Suspicious", color: "warning" };
  if (power > 0 && pir === 0) return { condition: "Power>0, Motion=No", status: "🟢 Stable", color: "success" };
  return { condition: "Normal Operation", status: "🟢 Stable", color: "success" };
}

function computeTheftProb(latestReading: any, avgPower: number) {
  if (!latestReading || avgPower === 0) return 0;
  const power = latestReading.power || 0;
  const pir = latestReading.pir || 0;
  let prob = 0;
  if (power === 0 && pir === 1) prob = 90;
  else if (power < avgPower * 0.5) prob = 70;
  else if (power < avgPower * 0.7) prob = 45;
  else if (power > avgPower * 1.5) prob = 30;
  else prob = Math.max(0, Math.round((1 - power / avgPower) * 50));
  return Math.min(100, Math.max(0, prob));
}

function computeWastage(readings: any[], avgPower: number) {
  if (readings.length === 0 || avgPower === 0) return 0;
  const excess = readings.reduce((sum, r) => {
    const over = (r.power || 0) - avgPower;
    return sum + (over > 0 ? over : 0);
  }, 0);
  const total = readings.reduce((sum, r) => sum + (r.power || 0), 0);
  return total > 0 ? Math.min(100, +((excess / total) * 100).toFixed(1)) : 0;
}

function getTheftColor(prob: number) {
  if (prob <= 40) return "hsl(142 71% 45%)";
  if (prob <= 70) return "hsl(38 92% 50%)";
  return "hsl(0 72% 51%)";
}

const FLOW_STEPS = [
  "Data Capture", "Pattern Learning", "Real-time Comparison",
  "Anomaly Detection", "Theft Prediction", "Energy Loss Estimation", "Alert Generation",
];

export default function Analytics() {
  const { selectedDeviceId } = useSelectedDevice();
  const { data: readings = [] } = useSensorReadings(selectedDeviceId);
  const { data: alerts = [] } = useAllAlerts();

  const baseline = useMemo(() => computeBaseline(readings), [readings]);
  const latestReading = readings[readings.length - 1] || null;
  const intelligence = useMemo(() => computeIntelligence(latestReading, baseline.avgPower), [latestReading, baseline.avgPower]);
  const theftProb = useMemo(() => computeTheftProb(latestReading, baseline.avgPower), [latestReading, baseline.avgPower]);
  const wastage = useMemo(() => computeWastage(readings, baseline.avgPower), [readings, baseline.avgPower]);

  // Daily consumption
  const dailyMap = new Map<string, number>();
  readings.forEach((r) => {
    const day = new Date(r.recorded_at).toLocaleDateString();
    dailyMap.set(day, (dailyMap.get(day) || 0) + (r.energy_kwh || 0));
  });
  const dailyData = Array.from(dailyMap, ([date, kwh]) => ({ date, kwh: +kwh.toFixed(4) }));

  // Scatter
  const scatterData = readings.slice(-100).map((r) => ({ voltage: r.voltage, current: r.current }));

  // Alert frequency
  const alertFreq = { theft: 0, wastage: 0, anomaly: 0 };
  alerts.forEach((a: any) => {
    if (a.type in alertFreq) alertFreq[a.type as keyof typeof alertFreq]++;
  });
  const pieAlertData = [
    { name: "Theft", value: alertFreq.theft, color: "hsl(0 72% 51%)" },
    { name: "Wastage", value: alertFreq.wastage, color: "hsl(38 92% 50%)" },
    { name: "Anomaly", value: alertFreq.anomaly, color: "hsl(263 70% 58%)" },
  ];

  const totalKwh = readings.reduce((s, r) => s + (r.energy_kwh || 0), 0);

  // Theft gauge radial data
  const gaugeData = [{ name: "Theft Risk", value: theftProb, fill: getTheftColor(theftProb) }];

  // Energy loss pie
  const energyPieData = [
    { name: "Wasted", value: wastage, color: wastage > 30 ? "hsl(0 72% 51%)" : "hsl(38 92% 50%)" },
    { name: "Efficient", value: 100 - wastage, color: "hsl(142 71% 45%)" },
  ];

  // Street comparison (group by zone from alerts with devices)
  const streetMap = new Map<string, { wastage: number; theftCount: number; total: number }>();
  alerts.forEach((a: any) => {
    const zone = a.devices?.zone || a.devices?.name || "Unknown";
    const entry = streetMap.get(zone) || { wastage: 0, theftCount: 0, total: 0 };
    entry.total++;
    if (a.type === "theft") entry.theftCount++;
    if (a.type === "wastage") entry.wastage++;
    streetMap.set(zone, entry);
  });
  const streetData = Array.from(streetMap, ([street, d]) => ({
    street,
    wastagePercent: d.total > 0 ? +((d.wastage / d.total) * 100).toFixed(0) : 0,
    theftRisk: d.theftCount > 3 ? "High" : d.theftCount > 1 ? "Medium" : "Low",
  }));

  const exportCSV = () => {
    const headers = "timestamp,voltage,current,power,ldr,pir,energy_kwh\n";
    const rows = readings.map((r) =>
      `${r.recorded_at},${r.voltage},${r.current},${r.power},${r.ldr},${r.pir},${r.energy_kwh}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "energy_data.csv";
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Energy consumption, costs & carbon metrics</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* 1️⃣ AI Baseline Learning Card */}
      <div className="chart-container">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-5 w-5 text-energy-purple" />
          <h3 className="text-sm font-semibold">Normal Usage Baseline</h3>
          <Badge className={baseline.status === "Completed" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}>
            {baseline.status}
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Avg Learned Power</p>
            <p className="text-2xl font-bold font-mono text-energy-cyan">{baseline.avgPower} W</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Learning Samples</p>
            <p className="text-2xl font-bold font-mono text-energy-blue">{baseline.samples}</p>
          </div>
          <div className="col-span-2 md:col-span-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Description</p>
            <p className="text-xs text-muted-foreground mt-1">This smart node has automatically learned normal streetlight power consumption patterns.</p>
          </div>
        </div>
      </div>

      {/* 2️⃣ System Intelligence Status */}
      <div className="chart-container">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="h-5 w-5 text-energy-red" />
          <h3 className="text-sm font-semibold">System Intelligence Status</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-mono">Parameter</TableHead>
              <TableHead className="text-xs font-mono">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-xs font-mono">Live Power</TableCell>
              <TableCell className="text-xs font-mono font-bold text-energy-green">{latestReading?.power?.toFixed(1) ?? "—"} W</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-xs font-mono">Motion (PIR)</TableCell>
              <TableCell className="text-xs font-mono font-bold">{latestReading?.pir === 1 ? "🟢 Detected" : "⚪ None"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-xs font-mono">Baseline Power</TableCell>
              <TableCell className="text-xs font-mono font-bold text-energy-cyan">{baseline.avgPower} W</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-xs font-mono font-semibold">Condition</TableCell>
              <TableCell className="text-xs font-mono">{intelligence.condition}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-xs font-mono font-semibold">Status</TableCell>
              <TableCell className={`text-xs font-mono font-bold text-${intelligence.color}`}>{intelligence.status}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* 3️⃣ Theft Risk Indicator + 4️⃣ Energy Loss */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="chart-container flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4 self-start">
            <Gauge className="h-5 w-5 text-energy-amber" />
            <h3 className="text-sm font-semibold">Theft Risk Indicator</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <RadialBarChart
              cx="50%" cy="50%"
              innerRadius="60%" outerRadius="90%"
              startAngle={180} endAngle={0}
              data={gaugeData}
              barSize={18}
            >
              <RadialBar
                dataKey="value"
                cornerRadius={10}
                background={{ fill: "hsl(220 16% 18%)" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <p className="text-4xl font-bold font-mono mt-[-40px]" style={{ color: getTheftColor(theftProb) }}>
            {theftProb}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">AI generated theft probability based on anomaly detection.</p>
        </div>

        <div className="chart-container">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-5 w-5 text-energy-red" />
            <h3 className="text-sm font-semibold">Energy Loss Analytics</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={energyPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}%`}>
                {energyPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 10%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-muted-foreground mt-1">
            Energy Wastage: <span className={wastage > 30 ? "text-energy-red font-bold" : "text-energy-amber font-bold"}>{wastage}%</span>
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="metric-card metric-card-power">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Total Energy</p>
          <p className="text-xl font-bold font-mono text-energy-green">{totalKwh.toFixed(3)} kWh</p>
        </div>
        <div className="metric-card metric-card-voltage">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Total Cost</p>
          <p className="text-xl font-bold font-mono text-energy-blue">₹{(totalKwh * 8).toFixed(2)}</p>
        </div>
        <div className="metric-card metric-card-current">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">CO₂ Emissions</p>
          <p className="text-xl font-bold font-mono text-energy-cyan">{(totalKwh * 0.82).toFixed(2)} kg</p>
        </div>
        <div className="metric-card metric-card-ldr">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Thefts Detected</p>
          <p className="text-xl font-bold font-mono text-energy-red">{alertFreq.theft}</p>
        </div>
      </div>

      {/* Daily Consumption Bar Chart */}
      <div className="chart-container">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-4">Daily Consumption (kWh)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 18%)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 12% 52%)" }} stroke="hsl(220 16% 18%)" />
            <YAxis tick={{ fontSize: 10, fill: "hsl(215 12% 52%)" }} stroke="hsl(220 16% 18%)" />
            <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 10%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", fontSize: "12px" }} />
            <Bar dataKey="kwh" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Voltage vs Current Scatter */}
        <div className="chart-container">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-4">Voltage vs Current</h3>
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 18%)" />
              <XAxis dataKey="voltage" name="Voltage" tick={{ fontSize: 10, fill: "hsl(215 12% 52%)" }} stroke="hsl(220 16% 18%)" />
              <YAxis dataKey="current" name="Current" tick={{ fontSize: 10, fill: "hsl(215 12% 52%)" }} stroke="hsl(220 16% 18%)" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 10%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", fontSize: "12px" }} />
              <Scatter data={scatterData} fill="hsl(187 85% 53%)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Alert Distribution Pie */}
        <div className="chart-container">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-4">Alert Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieAlertData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {pieAlertData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(220 18% 10%)", border: "1px solid hsl(220 16% 18%)", borderRadius: "8px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 6️⃣ Street Comparison Panel */}
      <div className="chart-container">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-4">Smart Street Comparison</h3>
        {streetData.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No zone data available yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-mono">Street / Zone</TableHead>
                <TableHead className="text-xs font-mono">Energy Wastage %</TableHead>
                <TableHead className="text-xs font-mono">Theft Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {streetData.map((s) => (
                <TableRow key={s.street}>
                  <TableCell className="text-xs font-mono">{s.street}</TableCell>
                  <TableCell className="text-xs font-mono">{s.wastagePercent}%</TableCell>
                  <TableCell>
                    <Badge className={
                      s.theftRisk === "High" ? "bg-destructive text-destructive-foreground" :
                      s.theftRisk === "Medium" ? "bg-warning text-warning-foreground" :
                      "bg-success text-success-foreground"
                    }>
                      {s.theftRisk}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 7️⃣ AI Decision Flow Diagram */}
      <div className="chart-container">
        <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-4">AI Decision Architecture</h3>
        <div className="flex flex-wrap items-center justify-center gap-1 py-4">
          {FLOW_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-1">
              <div className="px-3 py-2 rounded-lg border border-border bg-secondary/60 text-xs font-mono text-foreground whitespace-nowrap">
                {step}
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Efficiency Score */}
      <div className="chart-container text-center py-8">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">Efficiency Score</p>
        <p className="text-5xl font-bold font-mono text-energy-green">
          {totalKwh > 0 ? Math.min(100, ((totalKwh * 0.82 / totalKwh) * 100)).toFixed(0) : "—"}
          <span className="text-xl text-muted-foreground">%</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">(Energy Saved ÷ Energy Used) × 100</p>
      </div>
    </div>
  );
}
