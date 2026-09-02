import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

/**
 * KAVRIQO design-system primitives (packages/ui).
 * Styling comes from tokens.css (@kavriqo/ui/tokens.css).
 */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps): ReactNode {
  const variantClass = variant === 'primary' ? '' : ` kv-button--${variant}`;
  return (
    <button
      type="button"
      className={`kv-button${variantClass}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input className={`kv-input${props.className ? ` ${props.className}` : ''}`} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  return (
    <select className={`kv-select${props.className ? ` ${props.className}` : ''}`} {...props} />
  );
}

export interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, error, children }: FieldProps): ReactNode {
  return (
    <label className="kv-field">
      <span className="kv-field__label">{label}</span>
      {children}
      {error ? (
        <span className="kv-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export interface BadgeProps {
  tone: 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps): ReactNode {
  return <span className={`kv-badge kv-badge--${tone}`}>{children}</span>;
}

export function Card({ children }: { children: ReactNode }): ReactNode {
  return <div className="kv-card">{children}</div>;
}

export interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps): ReactNode {
  return (
    <div className="kv-page-header">
      <h1>{title}</h1>
      {actions ? <div className="kv-topbar__actions">{actions}</div> : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }): ReactNode {
  return <div className="kv-app-shell">{children}</div>;
}

export function Main({ children }: { children: ReactNode }): ReactNode {
  return <main className="kv-app-shell__main">{children}</main>;
}

export function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'info' | 'success';
  children: ReactNode;
}): ReactNode {
  return (
    <div className={`kv-alert kv-alert--${tone}`} role="alert">
      {children}
    </div>
  );
}
