import { Box, H2, Text, Illustration } from "@adminjs/design-system";

const Dashboard = () => {
  return (
    <Box variant="grey">
      <Box variant="white" p="xxl" style={{ textAlign: 'center', marginTop: '40px', borderRadius: '8px' }}>
        <H2>Welcome to VoiceWorker</H2>
        <Text mt="lg" mb="xxl">
          This is your central control dashboard for managing customer accounts, resource quotas, and streaming sessions.
        </Text>
        <Box flex justifyContent="center" width={1}>
          <Illustration variant="Astronaut" />
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
