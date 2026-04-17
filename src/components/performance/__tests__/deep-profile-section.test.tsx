import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, findByText } from '@testing-library/react';
import { DeepProfileSection } from '../deep-profile-section';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

const SYNTHETIC_PROFILE: DeepProfile = {
  igUserId: 'test-ig',
  handle: 'testhandle',
  followerCount: 12500,
  sampleSize: 30,
  medians: {
    reach: 800,
    views: 1200,
    likes: 90,
    comments: 12,
    saves: 30,
    shares: 8,
  },
  formatPerformance: [
    {
      format: 'REEL',
      count: 10,
      medianReach: 1200,
      medianSaves: 45,
      medianShares: 12,
      liftVsOverall: 1.5,
    },
    {
      format: 'CAROUSEL',
      count: 10,
      medianReach: 700,
      medianSaves: 25,
      medianShares: 6,
      liftVsOverall: 0.875,
    },
    {
      format: 'IMAGE',
      count: 10,
      medianReach: 500,
      medianSaves: 20,
      medianShares: 4,
      liftVsOverall: 0.625,
    },
  ],
  hookPatterns: [
    {
      pattern: 'here is the truth',
      exampleCaptions: ['Here is the truth about growing on Instagram this year'],
      avgReach: 1400,
      occurrences: 3,
    },
  ],
  captionLengthSweetSpot: {
    shortMedian: 600,
    mediumMedian: 1100,
    longMedian: 800,
    winner: 'medium',
  },
  timing: {
    heatmap: [],
    bestSlots: [{ day: 'Monday', hour: 9, medianReach: 1300 }],
  },
  topicSignals: {
    winning: ['#growth', '#instagram'],
    losing: ['#follow4follow'],
  },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SYNTHETIC_PROFILE,
    }),
  );
});

describe('DeepProfileSection', () => {
  it('renders the deep profile after fetch resolves', async () => {
    const { container, findByText: find } = render(
      <DeepProfileSection igUserId="test-ig" />,
    );

    await find('@testhandle');

    expect(container).toMatchSnapshot();
  });
});
