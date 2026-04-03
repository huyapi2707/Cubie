import { useEffect, useState } from "react";
import {
  Box,
  Header,
  Text,
  Badge,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Label,
} from "@adminjs/design-system";

interface SessionQuota {
  id: string;
  userId?: string;
  sourceLanguage: string;
  targetLanguage: string;
  ttsGender: string;
  isStreaming: boolean;
  createdAt: string;
  lastActivityAt: string;
  quota: {
    usage: number;
    maxQuota: number;
  } | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(isoString: string): string {
  const elapsed = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/* ── Double Column Chart ─────────────────────────────────────────────── */

const CHART_COLORS = {
  usage: "#6366f1",      // indigo
  usageHover: "#818cf8",
  maxQuota: "#e2e8f0",   // light gray
  maxQuotaHover: "#cbd5e1",
  exceeded: "#ef4444",   // red
  exceededHover: "#f87171",
  label: "#64748b",
  grid: "#f1f5f9",
};

interface ChartProps {
  sessions: SessionQuota[];
}

function QuotaChart({ sessions }: ChartProps) {
  const sessionsWithQuota = sessions.filter((s) => s.quota);

  if (sessionsWithQuota.length === 0) {
    return (
      <Box p="xl" style={{ textAlign: "center", color: CHART_COLORS.label }}>
        <Text>No quota data to display</Text>
      </Box>
    );
  }

  // Chart dimensions
  const barWidth = 28;
  const barGap = 4;
  const groupGap = 32;
  const groupWidth = barWidth * 2 + barGap + groupGap;
  const chartWidth = Math.max(sessionsWithQuota.length * groupWidth + 60, 400);
  const chartHeight = 260;
  const paddingTop = 20;
  const paddingBottom = 60;
  const paddingLeft = 60;
  const drawHeight = chartHeight - paddingTop - paddingBottom;

  // Find max value for scale
  const maxValue = Math.max(
    ...sessionsWithQuota.map((s) =>
      Math.max(s.quota!.usage, s.quota!.maxQuota)
    ),
    1
  );

  // Y-axis scale
  const yScale = (value: number) =>
    paddingTop + drawHeight - (value / maxValue) * drawHeight;

  // Grid lines (5 lines)
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const value = (maxValue / 4) * i;
    return { y: yScale(value), label: formatBytes(value) };
  });

  return (
    <Box style={{ overflowX: "auto", paddingBottom: "8px" }}>
      <svg
        width={chartWidth}
        height={chartHeight}
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      >
        {/* Grid lines */}
        {gridLines.map((line, i) => (
          <g key={i}>
            <line
              x1={paddingLeft}
              y1={line.y}
              x2={chartWidth}
              y2={line.y}
              stroke={CHART_COLORS.grid}
              strokeWidth={1}
            />
            <text
              x={paddingLeft - 8}
              y={line.y + 4}
              textAnchor="end"
              fill={CHART_COLORS.label}
              fontSize={10}
            >
              {line.label}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={paddingLeft}
          y1={paddingTop + drawHeight}
          x2={chartWidth}
          y2={paddingTop + drawHeight}
          stroke="#cbd5e1"
          strokeWidth={1}
        />

        {/* Bars */}
        {sessionsWithQuota.map((session, i) => {
          const groupX = paddingLeft + i * groupWidth + groupGap / 2;
          const usage = session.quota!.usage;
          const max = session.quota!.maxQuota;
          const pct = max > 0 ? (usage / max) * 100 : 0;
          const exceeded = pct >= 100;

          const usageHeight = Math.max((usage / maxValue) * drawHeight, 2);
          const maxHeight = Math.max((max / maxValue) * drawHeight, 2);

          const usageColor = exceeded
            ? CHART_COLORS.exceeded
            : CHART_COLORS.usage;

          return (
            <g key={session.id}>
              {/* Max Quota bar */}
              <rect
                x={groupX + barWidth + barGap}
                y={paddingTop + drawHeight - maxHeight}
                width={barWidth}
                height={maxHeight}
                fill={CHART_COLORS.maxQuota}
                rx={3}
                ry={3}
              >
                <title>Max Quota: {formatBytes(max)}</title>
              </rect>

              {/* Usage bar */}
              <rect
                x={groupX}
                y={paddingTop + drawHeight - usageHeight}
                width={barWidth}
                height={usageHeight}
                fill={usageColor}
                rx={3}
                ry={3}
              >
                <title>Usage: {formatBytes(usage)} ({Math.round(pct)}%)</title>
              </rect>

              {/* Value labels on top */}
              <text
                x={groupX + barWidth / 2}
                y={paddingTop + drawHeight - usageHeight - 6}
                textAnchor="middle"
                fill={usageColor}
                fontSize={9}
                fontWeight={600}
              >
                {formatBytes(usage)}
              </text>
              <text
                x={groupX + barWidth + barGap + barWidth / 2}
                y={paddingTop + drawHeight - maxHeight - 6}
                textAnchor="middle"
                fill={CHART_COLORS.label}
                fontSize={9}
                fontWeight={600}
              >
                {formatBytes(max)}
              </text>

              {/* X-axis label */}
              <text
                x={groupX + barWidth + barGap / 2}
                y={paddingTop + drawHeight + 16}
                textAnchor="middle"
                fill={CHART_COLORS.label}
                fontSize={10}
              >
                {session.userId?.slice(0, 8) || session.id.slice(0, 6)}
              </text>
              <text
                x={groupX + barWidth + barGap / 2}
                y={paddingTop + drawHeight + 30}
                textAnchor="middle"
                fill={exceeded ? CHART_COLORS.exceeded : CHART_COLORS.label}
                fontSize={9}
                fontWeight={exceeded ? 700 : 400}
              >
                {Math.round(pct)}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <Box
        flex
        flexDirection="row"
        style={{ gap: "20px", justifyContent: "center", marginTop: "8px" }}
      >
        <Box flex flexDirection="row" style={{ alignItems: "center", gap: "6px" }}>
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              backgroundColor: CHART_COLORS.usage,
            }}
          />
          <Text style={{ fontSize: "12px", color: CHART_COLORS.label }}>
            Current Usage
          </Text>
        </Box>
        <Box flex flexDirection="row" style={{ alignItems: "center", gap: "6px" }}>
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              backgroundColor: CHART_COLORS.maxQuota,
            }}
          />
          <Text style={{ fontSize: "12px", color: CHART_COLORS.label }}>
            Max Quota
          </Text>
        </Box>
        <Box flex flexDirection="row" style={{ alignItems: "center", gap: "6px" }}>
          <Box
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              backgroundColor: CHART_COLORS.exceeded,
            }}
          />
          <Text style={{ fontSize: "12px", color: CHART_COLORS.label }}>
            Exceeded
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */

const QuotaUsagePage = () => {
  const [sessions, setSessions] = useState<SessionQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/quota-usage");
        if (!response.ok) throw new Error("Failed to fetch quota data");
        const data = await response.json();
        const incoming: SessionQuota[] = data.sessions || [];
        setSessions((prev) => {
          const activeIds = new Set(incoming.map((s) => s.id));
          // Keep previously known sessions that are no longer active
          const preserved = prev
            .filter((s) => !activeIds.has(s.id))
            .map((s) => ({ ...s, isStreaming: false }));
          // Active sessions first, then preserved (ended) ones
          return [...incoming, ...preserved];
        });
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading)
    return (
      <Box p="xl">
        <Text>Loading quota data...</Text>
      </Box>
    );
  if (error)
    return (
      <Box p="xl">
        <Text color="error">{error}</Text>
      </Box>
    );

  return (
    <Box p="xl">
      <Header>Quota Usage</Header>

      {/* ── Summary Cards ────────────────────────────────────── */}
      <Box mb="xl" flex flexDirection="row" style={{ gap: "20px" }}>
        <Box p="lg" variant="card">
          <Label>Active Sessions</Label>
          <Text variant="h1">{sessions.length}</Text>
        </Box>
        <Box p="lg" variant="card">
          <Label>Streaming</Label>
          <Text variant="h1">
            {sessions.filter((s) => s.isStreaming).length}
          </Text>
        </Box>
        <Box p="lg" variant="card">
          <Label>Unique Users</Label>
          <Text variant="h1">
            {new Set(sessions.map((s) => s.userId).filter(Boolean)).size}
          </Text>
        </Box>
      </Box>

      {/* ── Chart ────────────────────────────────────────────── */}
      <Box mb="xl" variant="card" p="lg">
        <Header.H3 style={{ marginBottom: "16px" }}>
          Usage vs Max Quota
        </Header.H3>
        <QuotaChart sessions={sessions} />
      </Box>

      {/* ── Sessions Table ───────────────────────────────────── */}
      {sessions.length === 0 ? (
        <Box p="xl" style={{ textAlign: "center" }}>
          <Text>No active sessions</Text>
        </Box>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Session ID</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Languages</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Quota Usage</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sessions.map((session) => {
              const pct =
                session.quota && session.quota.maxQuota > 0
                  ? Math.round(
                      (session.quota.usage / session.quota.maxQuota) * 100
                    )
                  : 0;

              return (
                <TableRow key={session.id}>
                  <TableCell>
                    <Text style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {session.id.slice(0, 8)}…
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text>{session.userId || "—"}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" style={{ marginRight: 4 }}>
                      {session.sourceLanguage}
                    </Badge>
                    →
                    <Badge variant="default" style={{ marginLeft: 4 }}>
                      {session.targetLanguage}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={session.isStreaming ? "primary" : "secondary"}
                    >
                      {session.isStreaming ? "Streaming" : "Idle"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Text>{formatDuration(session.createdAt)}</Text>
                  </TableCell>
                  <TableCell>
                    {session.quota ? (
                      <Box>
                        <Box
                          style={{
                            width: "100%",
                            height: "8px",
                            backgroundColor: "#e0e0e0",
                            borderRadius: "4px",
                            overflow: "hidden",
                            marginBottom: "4px",
                          }}
                        >
                          <Box
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              height: "100%",
                              backgroundColor:
                                pct >= 90
                                  ? "#e53e3e"
                                  : pct >= 70
                                  ? "#dd6b20"
                                  : "#38a169",
                              borderRadius: "4px",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </Box>
                        <Text style={{ fontSize: "12px" }}>
                          {formatBytes(session.quota.usage)} /{" "}
                          {formatBytes(session.quota.maxQuota)} ({pct}%)
                        </Text>
                      </Box>
                    ) : (
                      <Text style={{ fontSize: "12px", color: "#999" }}>
                        No quota data
                      </Text>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};

export default QuotaUsagePage;
