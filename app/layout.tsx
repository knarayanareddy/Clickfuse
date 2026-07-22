import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Clickfuse — Incident Proof Board",
  description: "A Trigger.dev + ClickHouse chat agent that assembles an evidence-backed incident proof board."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
