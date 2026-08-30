import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, Badge, Button, Field } from './primitives';

/**
 * Design-system primitives tests (03-D08): structural contract of the shared
 * UI package — class names, roles and semantics the app pages rely on.
 */
describe('primitives', () => {
  it('renders a Button with the primary variant by default and keeps type="button"', () => {
    render(<Button>Add vehicle</Button>);

    const button = screen.getByRole('button', { name: 'Add vehicle' });
    expect(button).toHaveClass('kv-button');
    expect(button).not.toHaveClass('kv-button--danger');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('renders a Badge with the requested tone class', () => {
    const { container } = render(<Badge tone="success">Available</Badge>);

    const badge = screen.getByText('Available');
    expect(badge).toHaveClass('kv-badge', 'kv-badge--success');
    expect(container.querySelector('.kv-badge--success')).toBe(badge);
  });

  it('renders a Field with its label and an accessible error message', () => {
    render(
      <Field label="Plate" error="Plate number is required.">
        <input className="kv-input" />
      </Field>,
    );

    expect(screen.getByText('Plate')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Plate number is required.');
  });

  it('renders an Alert with role="alert" and its tone class', () => {
    render(<Alert tone="error">Something went wrong while loading the fleet.</Alert>);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong while loading the fleet.');
    expect(alert).toHaveClass('kv-alert--error');
  });
});
