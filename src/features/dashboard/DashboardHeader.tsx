interface DashboardHeaderProps {
  releaseCount: number;
}

export function DashboardHeader({ releaseCount }: DashboardHeaderProps) {
  return (
    <header className="dashboard-header">
      <div>
        <span className="dashboard-eyebrow">Operations overview</span>
        <h1>Dashboard</h1>
      </div>
      <p>{releaseCount === 0 ? "Start by creating your first release." : `${releaseCount} release${releaseCount === 1 ? "" : "s"} in your workspace.`}</p>
    </header>
  );
}
