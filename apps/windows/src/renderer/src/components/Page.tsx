import { Spinner } from "@fluentui/react-components";

export function PageHeader(props: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="page-header">
      <div>
        <h1>{props.title}</h1>
        <p>{props.subtitle}</p>
      </div>
      {props.actions ? (
        <div className="page-actions">{props.actions}</div>
      ) : null}
    </div>
  );
}

export function StatCard(props: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: string;
}): React.JSX.Element {
  return (
    <section className={`stat-card ${props.tone ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail ? <small>{props.detail}</small> : null}
    </section>
  );
}

export function Loading(): React.JSX.Element {
  return (
    <div className="loading">
      <Spinner label="正在读取本地数据" />
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      <p>{props.detail}</p>
      {props.action}
    </div>
  );
}
