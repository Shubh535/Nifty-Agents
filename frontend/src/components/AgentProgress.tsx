'use client';

type AgentStatus = 'pending' | 'in_progress' | 'completed' | 'error';

interface AgentState {
  [agent: string]: AgentStatus;
}

export default function AgentProgress({ agents }: { agents: AgentState }) {
  const entries = Object.entries(agents);
  if (entries.length === 0) return null;

  return (
    <div className="agents-grid">
      {entries.map(([name, status]) => (
        <div key={name} className={`agent-row ${status}`}>
          <div className="agent-dot" />
          <span className="agent-name">{name}</span>
          <span className="agent-status-text">
            {status === 'in_progress' ? 'Working...' : status}
          </span>
        </div>
      ))}
    </div>
  );
}
