import { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";

interface DashboardShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  fixedHeight?: boolean;
}

export function DashboardShell({
  title,
  subtitle,
  children,
  fixedHeight,
}: DashboardShellProps) {
  return (
    <div
      className="app-shell"
      style={fixedHeight ? { height: "100vh", overflow: "hidden" } : {}}
    >
      <AppSidebar />
      <main
        className="app-main"
        style={
          fixedHeight
            ? {
                margin: "1rem auto",
                height: "calc(100vh - 2rem)",
                overflow: "hidden",
              }
            : {}
        }
      >
        <header
          className="page-head cyber-card"
          style={fixedHeight ? { flexShrink: 0 } : {}}
        >
          <p className="code-tag">AGENTIC COMMERCE CONSOLE</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </header>
        {children}
      </main>
    </div>
  );
}
