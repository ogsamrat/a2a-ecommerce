import { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";

interface DashboardShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function DashboardShell({
  title,
  subtitle,
  children,
}: DashboardShellProps) {
  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="app-main">
        <header className="page-head cyber-card">
          <p className="code-tag">AGENTIC COMMERCE CONSOLE</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </header>
        {children}
      </main>
    </div>
  );
}
