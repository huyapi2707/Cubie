import { useEffect, useState } from "react";
import { Box, Header, Text, Badge, Table, TableHead, TableBody, TableRow, TableCell, Label } from "@adminjs/design-system";

const MetricsDashboard = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch("/metrics");
        if (!response.ok) throw new Error("Failed to fetch metrics");
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <Box p="xl"><Text>Loading metrics...</Text></Box>;
  if (!metrics) return <Box p="xl"><Text>Error loading metrics.</Text></Box>;

  return (
    <Box p="xl">
      <Header>VoiceWorker Metrics</Header>
      
      <Box mb="xl" flex flexDirection="row" style={{ gap: '20px' }}>
        <Box p="lg" variant="card">
          <Label>Active Sessions</Label>
          <Text variant="h1">{metrics.sessions.active}</Text>
        </Box>
        <Box p="lg" variant="card">
          <Label>Total Workers</Label>
          <Text variant="h1">{metrics.workers.totalWorkers}</Text>
        </Box>
        <Box p="lg" variant="card">
          <Label>Busy Workers</Label>
          <Text variant="h1">{metrics.workers.busyWorkers}</Text>
        </Box>
        <Box p="lg" variant="card">
          <Label>Queued Tasks</Label>
          <Text variant="h1">{metrics.workers.queuedTasks}</Text>
        </Box>
      </Box>

      <Header.H3>Worker Pool Status</Header.H3>
      <Table mb="xl">
        <TableHead>
          <TableRow>
            <TableCell>Worker Index</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Current Tasks</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {metrics.workers.taskCounts.map((count: number, index: number) => (
            <TableRow key={index}>
              <TableCell>Worker #{index}</TableCell>
              <TableCell>
                <Badge variant={count === 0 ? 'success' : 'primary'}>
                  {count === 0 ? 'Idle' : 'Active'}
                </Badge>
              </TableCell>
              <TableCell>{count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

export default MetricsDashboard;
