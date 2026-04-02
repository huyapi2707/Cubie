import { Box, Button, FormGroup, Input, Label, H2, Text, MessageBox, Illustration } from "@adminjs/design-system";

export type LoginProps = {
  message?: string;
  action: string;
};

const Login = (props: LoginProps) => {
  const { action, message } = props;

  return (
    <Box flex flexDirection="column" alignItems="center" justifyContent="center" style={{ height: "100vh", backgroundColor: "#f4f4f4" }}>
      <Box variant="white" p="xxl" style={{ width: "400px", borderRadius: "12px", boxShadow: "0px 8px 32px rgba(0,0,0,0.05)" }}>
        <Box textAlign="center" mb="xl">
          <Illustration variant="Astronaut" />
          <H2 mt="lg" mb="sm">VoiceWorker</H2>
          <Text variant="sm">Secure Admin Access</Text>
        </Box>
        
        {message && (
          <MessageBox message={message} variant="danger" mb="lg" />
        )}

        <form action={action} method="POST">
          <FormGroup>
            <Label required>Email Address</Label>
            <Input name="email" placeholder="admin@example.com" type="email" width={1} required />
          </FormGroup>
          <FormGroup>
            <Label required>Password</Label>
            <Input type="password" name="password" placeholder="••••••••" width={1} required />
          </FormGroup>
          <Button variant="primary" size="lg" width={1} mt="xl" style={{ justifyContent: "center" }}>
            Sign In
          </Button>
        </form>
      </Box>
    </Box>
  );
};

export default Login;
