import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepReady } from '../onboarding-wizard';

// StepReady is the reworked finale: it must explain how the product works and
// offer the two exits (set up Autopilot / explore on my own). It's exported and
// presentational, so we test it in isolation without driving all five steps.
describe('OnboardingWizard — StepReady finale', () => {
  it('explains the product loop (how it works) with all three steps', () => {
    render(
      <StepReady
        brandName="Acme"
        toolsConnected={2}
        onExplore={vi.fn()}
        onSetupAutopilot={vi.fn()}
      />,
    );

    expect(screen.getByText(/here's how it works/i)).toBeTruthy();
    expect(screen.getByText(/learns your brand nightly/i)).toBeTruthy();
    expect(screen.getByText(/quality-gated posts/i)).toBeTruthy();
    expect(screen.getByText(/schedules them to buffer/i)).toBeTruthy();
  });

  it('shows a compact brand + tools recap', () => {
    render(
      <StepReady
        brandName="Acme"
        toolsConnected={1}
        onExplore={vi.fn()}
        onSetupAutopilot={vi.fn()}
      />,
    );

    // Singular tool label, brand name present.
    expect(screen.getByText(/Acme is set up · 1 tool connected/i)).toBeTruthy();
  });

  it('primary CTA finishes onboarding and heads to Autopilot', () => {
    const onSetupAutopilot = vi.fn();
    const onExplore = vi.fn();
    render(
      <StepReady
        brandName="Acme"
        toolsConnected={2}
        onExplore={onExplore}
        onSetupAutopilot={onSetupAutopilot}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /set up autopilot/i }));
    expect(onSetupAutopilot).toHaveBeenCalledTimes(1);
    expect(onExplore).not.toHaveBeenCalled();
  });

  it('secondary CTA dismisses without navigating', () => {
    const onSetupAutopilot = vi.fn();
    const onExplore = vi.fn();
    render(
      <StepReady
        brandName=""
        toolsConnected={0}
        onExplore={onExplore}
        onSetupAutopilot={onSetupAutopilot}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /explore on my own/i }));
    expect(onExplore).toHaveBeenCalledTimes(1);
    expect(onSetupAutopilot).not.toHaveBeenCalled();
  });
});
