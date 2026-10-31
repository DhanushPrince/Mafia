// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Rules from './Rules';

afterEach(cleanup);

describe('Rules', () => {
  it('renders the five-step stepper and switches sections', () => {
    const { container } = render(<Rules onClose={() => {}} />);
    for (const label of ['1 Players', '2 Roles', '3 Night', '4 Day', '5 Win']) expect(screen.getByText(label)).toBeTruthy();
    // a chevron between each pair of steps (hidden below sm, still rendered)
    expect(container.querySelectorAll('svg.lucide-chevron-right').length).toBe(4);
    fireEvent.click(screen.getAllByRole('button', { name: /HOW TO WIN/ })[0]);
    expect(screen.getByText('Mafia Win')).toBeTruthy();
  });

  it('closes from the X and from the call to action, but not from a tap inside the panel', () => {
    const onClose = vi.fn();
    render(<Rules onClose={onClose} />);
    fireEvent.click(screen.getByText('TUTORIAL PREVIEW'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close rules' }));
    fireEvent.click(screen.getByRole('button', { name: /GOT IT/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
