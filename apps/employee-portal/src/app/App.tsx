import { Button, Card, Flex, Tag, Typography } from "antd";

export default function App() {
  return (
    <main className="page">
      <Card className="hero">
        <Flex gap={12} vertical>
          <Tag color="blue">Initial Project</Tag>
          <Typography.Title level={2}>Portal Absensi WFH</Typography.Title>
          <Typography.Paragraph>
            UI
          </Typography.Paragraph>
          <Button type="primary" disabled>
            Masuk
          </Button>
        </Flex>
      </Card>
    </main>
  );
}
