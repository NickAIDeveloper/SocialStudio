export interface CompetitorPost {
  type: 'quote' | 'tip' | 'carousel' | 'reel' | 'community' | 'promo';
  description: string;
  engagementLevel: 'viral' | 'high' | 'medium';
  captionFormula: string;
  hashtagCount: number;
  visualStyle: string;
}

export interface CompetitorData {
  name: string;
  handle: string;
  followers: string;
  brand: 'affectly' | 'pacebrain';
  postingFrequency: string;
  bestPostingTimes: string[];
  topContentTypes: CompetitorPost[];
  hashtagStrategy: {
    branded: string[];
    reach: string[];
    niche: string[];
  };
  captionStyle: {
    tone: string;
    avgLength: string;
    structure: string;
    ctaPatterns: string[];
  };
  visualStyle: {
    colors: string[];
    imageryType: string[];
    textOverlay: boolean;
    logoPlacement: string;
  };
  winningFormulas: string[];
}

export const competitors: CompetitorData[] = [
  // === AFFECTLY COMPETITORS ===
  {
    name: 'Calm',
    handle: '@calm',
    followers: '4M',
    brand: 'affectly',
    postingFrequency: '1-2 posts/day',
    bestPostingTimes: ['7:00 AM', '12:00 PM', '8:00 PM'],
    topContentTypes: [
      {
        type: 'quote',
        description: 'Minimalist quote cards with soft gradients and nature backgrounds',
        engagementLevel: 'viral',
        captionFormula: 'Short reflection + question to audience',
        hashtagCount: 5,
        visualStyle: 'Soft pastel gradients, centered serif text, nature imagery'
      },
      {
        type: 'reel',
        description: 'Guided breathing exercises and nature soundscapes',
        engagementLevel: 'high',
        captionFormula: 'Hook question + benefit + CTA to try the app',
        hashtagCount: 5,
        visualStyle: 'Calming nature footage, slow motion, warm tones'
      },
      {
        type: 'carousel',
        description: '5-slide wellness tips with consistent brand colors',
        engagementLevel: 'high',
        captionFormula: 'List format: "5 ways to..." + save prompt',
        hashtagCount: 5,
        visualStyle: 'Brand blue/purple gradients, clean typography'
      }
    ],
    hashtagStrategy: {
      branded: ['#CalmApp', '#DailyCalm', '#CalmMoment'],
      reach: ['#MentalHealth', '#Meditation', '#Mindfulness', '#SelfCare', '#Wellness', '#MentalHealthMatters', '#Anxiety', '#StressRelief'],
      niche: ['#MindfulLiving', '#InnerPeace', '#MeditationPractice', '#MindfulnessMatters', '#HealingJourney']
    },
    captionStyle: {
      tone: 'Warm, gentle, reassuring',
      avgLength: '50-150 words',
      structure: 'Hook line + 2-3 sentences of value + question or CTA',
      ctaPatterns: ['What helps you find calm?', 'Save this for when you need it', 'Tag someone who needs this today', 'Link in bio for more']
    },
    visualStyle: {
      colors: ['#4A90D9', '#7B68EE', '#E8D5B7', '#F5F0EB'],
      imageryType: ['Nature landscapes', 'Soft gradients', 'Minimal illustrations', 'Sunset/sunrise'],
      textOverlay: true,
      logoPlacement: 'Bottom-right, subtle'
    },
    winningFormulas: [
      'Relatable mental health struggles + gentle solution',
      'Beautiful nature imagery + single powerful quote',
      'Breathing exercise reels with timer overlay',
      '"Permission to..." posts (permission to rest, to feel, to pause)',
      'Seasonal wellness tips tied to current events'
    ]
  },
  {
    name: 'Headspace',
    handle: '@headspace',
    followers: '1M',
    brand: 'affectly',
    postingFrequency: '1 post/day',
    bestPostingTimes: ['8:00 AM', '1:00 PM', '7:00 PM'],
    topContentTypes: [
      {
        type: 'carousel',
        description: 'Illustrated mental health tips with signature cartoon style',
        engagementLevel: 'viral',
        captionFormula: 'Relatable opening + educational content + save CTA',
        hashtagCount: 5,
        visualStyle: 'Signature orange/coral illustrations, playful cartoon characters'
      },
      {
        type: 'quote',
        description: 'Bold text on colorful backgrounds with mental health affirmations',
        engagementLevel: 'high',
        captionFormula: 'Expansion on the quote + personal touch + question',
        hashtagCount: 5,
        visualStyle: 'Bright solid colors, bold sans-serif, rounded shapes'
      },
      {
        type: 'reel',
        description: 'Quick meditation techniques and mental health myth-busting',
        engagementLevel: 'high',
        captionFormula: 'Myth vs fact hook + explanation + try it CTA',
        hashtagCount: 5,
        visualStyle: 'Animated characters, bright colors, fast-paced cuts'
      }
    ],
    hashtagStrategy: {
      branded: ['#Headspace', '#HeadspaceGuide', '#BeKindToYourMind'],
      reach: ['#MentalHealth', '#Meditation', '#Mindfulness', '#SelfCareTips', '#AnxietyRelief', '#MentalWellness'],
      niche: ['#MindfulMinutes', '#MeditateDaily', '#TherapyIsNormal', '#MentalHealthAwareness']
    },
    captionStyle: {
      tone: 'Playful, approachable, educational',
      avgLength: '80-200 words',
      structure: 'Relatable hook + educational value + lighthearted CTA',
      ctaPatterns: ['Your mind will thank you', 'Double tap if you relate', 'Share with someone who needs a reminder', 'Try this today']
    },
    visualStyle: {
      colors: ['#FF6B35', '#FFC145', '#FF8C42', '#F9F4EF'],
      imageryType: ['Custom illustrations', 'Cartoon characters', 'Bold typography', 'Animated graphics'],
      textOverlay: true,
      logoPlacement: 'Top-left or bottom-center'
    },
    winningFormulas: [
      'Illustrated "what X looks like vs what it feels like" comparisons',
      'Quick 30-second breathing technique reels',
      'Myth-busting carousels about mental health',
      '"Your daily reminder that..." affirmation posts',
      'Relatable humor about anxiety/stress with educational follow-up'
    ]
  },
  {
    name: 'Wysa',
    handle: '@wysa_buddy',
    followers: '58K',
    brand: 'affectly',
    postingFrequency: '3-4 posts/week',
    bestPostingTimes: ['9:00 AM', '6:00 PM'],
    topContentTypes: [
      {
        type: 'quote',
        description: 'Mental health affirmations with penguin mascot illustrations',
        engagementLevel: 'high',
        captionFormula: 'Empathetic opening + gentle advice + engagement question',
        hashtagCount: 5,
        visualStyle: 'Cute penguin character, soft blues and yellows'
      },
      {
        type: 'tip',
        description: 'CBT-based coping strategies presented as simple steps',
        engagementLevel: 'medium',
        captionFormula: 'Problem statement + numbered steps + encouragement',
        hashtagCount: 5,
        visualStyle: 'Clean infographic style, pastel backgrounds'
      },
      {
        type: 'carousel',
        description: 'Self-care checklists and emotional wellness guides',
        engagementLevel: 'high',
        captionFormula: 'Relatable struggle + carousel preview + save CTA',
        hashtagCount: 5,
        visualStyle: 'Illustrated steps, consistent brand colors'
      }
    ],
    hashtagStrategy: {
      branded: ['#Wysa', '#WysaBuddy', '#AITherapy'],
      reach: ['#MentalHealth', '#SelfCare', '#Anxiety', '#Depression', '#Therapy', '#MentalHealthSupport'],
      niche: ['#CBT', '#CopingSkills', '#EmotionalWellness', '#MindfulnessApp', '#TherapyApp', '#DigitalWellness']
    },
    captionStyle: {
      tone: 'Empathetic, supportive, conversational',
      avgLength: '100-180 words',
      structure: 'Acknowledgment of struggle + practical tip + warm encouragement',
      ctaPatterns: ['You are not alone in this', 'What coping strategy works for you?', 'Save this for tough days', 'Try Wysa free - link in bio']
    },
    visualStyle: {
      colors: ['#4ECDC4', '#FFE66D', '#2C3E50', '#F7F7F7'],
      imageryType: ['Cute mascot illustrations', 'Soft infographics', 'Pastel backgrounds'],
      textOverlay: true,
      logoPlacement: 'Bottom-right with mascot'
    },
    winningFormulas: [
      'Cute mascot delivering serious mental health advice',
      'CBT technique breakdowns in simple visual steps',
      '"When you feel X, try Y" actionable posts',
      'Relatable anxiety/depression moments with gentle solutions',
      'Self-care checklists people want to screenshot and save'
    ]
  },
  {
    name: 'Nedra Tawwab',
    handle: '@nedratawwab',
    followers: '2M',
    brand: 'affectly',
    postingFrequency: '1-2 posts/day',
    bestPostingTimes: ['7:00 AM', '11:00 AM', '7:00 PM'],
    topContentTypes: [
      {
        type: 'quote',
        description: 'Text-heavy quote cards with boundary/self-care wisdom',
        engagementLevel: 'viral',
        captionFormula: 'Quote expansion + personal insight + community question',
        hashtagCount: 5,
        visualStyle: 'Simple white/cream backgrounds, clean serif text'
      },
      {
        type: 'carousel',
        description: 'Multi-slide boundary setting guides and relationship tips',
        engagementLevel: 'viral',
        captionFormula: 'Title statement + detailed breakdown + share CTA',
        hashtagCount: 5,
        visualStyle: 'Minimal design, text-focused, warm tones'
      },
      {
        type: 'tip',
        description: 'Practical boundary-setting scripts and self-care advice',
        engagementLevel: 'high',
        captionFormula: 'Scenario + what to say/do + why it matters',
        hashtagCount: 5,
        visualStyle: 'Clean text layouts, occasional soft photography'
      }
    ],
    hashtagStrategy: {
      branded: ['#SetBoundaries', '#NedraGlennon'],
      reach: ['#MentalHealth', '#Boundaries', '#SelfCare', '#Healing', '#Therapy'],
      niche: ['#HealthyRelationships', '#BoundaryQueen', '#EmotionalHealth', '#SelfLove']
    },
    captionStyle: {
      tone: 'Authoritative, warm, direct',
      avgLength: '100-300 words',
      structure: 'Bold statement + explanation + real-world application',
      ctaPatterns: ['What boundary do you need to set today?', 'Share this with someone who needs to hear it', 'Comment below your experience']
    },
    visualStyle: {
      colors: ['#F5F0EB', '#2C2C2C', '#D4A574', '#8B7355'],
      imageryType: ['Text-focused cards', 'Minimal photography', 'Warm earth tones'],
      textOverlay: true,
      logoPlacement: 'Minimal, name as watermark'
    },
    winningFormulas: [
      'Bold boundary statements that feel like personal revelations',
      '"It is okay to..." permission-giving posts',
      'Scripts for difficult conversations',
      'Signs you need to set a boundary (list format)',
      'Reframing guilt about self-care'
    ]
  },

  // === PACEBRAIN COMPETITORS ===
  {
    name: 'Strava',
    handle: '@strava',
    followers: '1.6M',
    brand: 'pacebrain',
    postingFrequency: '1-2 posts/day',
    bestPostingTimes: ['6:00 AM', '12:00 PM', '5:00 PM'],
    topContentTypes: [
      {
        type: 'community',
        description: 'User achievement highlights and community milestones',
        engagementLevel: 'viral',
        captionFormula: 'Celebration + stats + community callout',
        hashtagCount: 5,
        visualStyle: 'Action photography, orange brand accents, data overlays'
      },
      {
        type: 'reel',
        description: 'Epic running footage with motivational overlay text',
        engagementLevel: 'viral',
        captionFormula: 'Motivational hook + runner story + engagement question',
        hashtagCount: 5,
        visualStyle: 'High-energy footage, sunrise/sunset runs, urban trails'
      },
      {
        type: 'carousel',
        description: 'Training tips, race prep guides, and running data insights',
        engagementLevel: 'high',
        captionFormula: 'Pain point + solution slides + save for race day CTA',
        hashtagCount: 5,
        visualStyle: 'Data visualizations, clean infographics, brand orange'
      }
    ],
    hashtagStrategy: {
      branded: ['#Strava', '#StravaRunning', '#StravaSegment', '#YearInSport'],
      reach: ['#Running', '#Marathon', '#TrailRunning', '#RunnerLife', '#FitnessMotivation', '#RunningCommunity'],
      niche: ['#5KTraining', '#MarathonTraining', '#RunningData', '#PaceMaker', '#RunHappy']
    },
    captionStyle: {
      tone: 'Energetic, data-driven, community-focused',
      avgLength: '50-150 words',
      structure: 'Achievement hook + context/story + community question',
      ctaPatterns: ['Tag your running buddy', 'Drop your PB below', 'What is your next race?', 'Upload your run to Strava']
    },
    visualStyle: {
      colors: ['#FC4C02', '#FFFFFF', '#2D2D2D', '#F7F7F7'],
      imageryType: ['Action photography', 'Running routes/maps', 'Data visualizations', 'Sunrise/sunset runs'],
      textOverlay: true,
      logoPlacement: 'Corner badge, orange accent'
    },
    winningFormulas: [
      'Community achievement celebrations with real runner data',
      'Sunrise/golden hour running footage with motivational text',
      'Race day tips carousels people save for later',
      '"Every run counts" inclusive messaging that celebrates all paces',
      'Before/after training journey stories with real stats'
    ]
  },
  {
    name: 'Nike Run Club',
    handle: '@nikerunning',
    followers: '6M',
    brand: 'pacebrain',
    postingFrequency: '1-2 posts/day',
    bestPostingTimes: ['6:00 AM', '11:00 AM', '6:00 PM'],
    topContentTypes: [
      {
        type: 'reel',
        description: 'High-production athlete training footage and run stories',
        engagementLevel: 'viral',
        captionFormula: 'Inspirational one-liner + athlete story + just do it energy',
        hashtagCount: 5,
        visualStyle: 'Cinematic, high contrast, Nike swoosh, athlete close-ups'
      },
      {
        type: 'community',
        description: 'Real runner stories, first marathon finishes, community runs',
        engagementLevel: 'viral',
        captionFormula: 'Runner quote + their story + celebrate their achievement',
        hashtagCount: 5,
        visualStyle: 'Real photography, diverse runners, urban settings'
      },
      {
        type: 'quote',
        description: 'Bold motivational statements on minimal backgrounds',
        engagementLevel: 'high',
        captionFormula: 'Short, punchy statement + no fluff',
        hashtagCount: 5,
        visualStyle: 'Black/white, bold typography, minimal'
      }
    ],
    hashtagStrategy: {
      branded: ['#NikeRunning', '#NikeRunClub', '#JustDoIt'],
      reach: ['#Running', '#Marathon', '#RunnerLife', '#FitnessMotivation'],
      niche: ['#RunYourWay', '#EveryRunCounts', '#RunWithNike']
    },
    captionStyle: {
      tone: 'Bold, empowering, no-nonsense',
      avgLength: '20-80 words',
      structure: 'Short powerful statement + optional athlete reference',
      ctaPatterns: ['Just do it', 'Lace up', 'Your run. Your rules.', 'Run with us']
    },
    visualStyle: {
      colors: ['#000000', '#FFFFFF', '#FF6B00', '#1A1A1A'],
      imageryType: ['Cinematic athlete photos', 'Urban running', 'Diverse runners', 'High contrast B&W'],
      textOverlay: true,
      logoPlacement: 'Prominent swoosh, often centered'
    },
    winningFormulas: [
      'Cinematic "every runner has a story" human interest posts',
      'Bold single-sentence motivational text on black backgrounds',
      'Celebrating first-time runners and everyday athletes',
      'Race day energy - starting line/finish line moments',
      'Inclusive messaging: "If you have a body, you are a runner"'
    ]
  },
  {
    name: 'Garmin',
    handle: '@garmin',
    followers: '2M',
    brand: 'pacebrain',
    postingFrequency: '1-2 posts/day',
    bestPostingTimes: ['7:00 AM', '12:00 PM', '5:00 PM'],
    topContentTypes: [
      {
        type: 'tip',
        description: 'Training data insights, VO2 max tips, heart rate zone guides',
        engagementLevel: 'high',
        captionFormula: 'Data insight + what it means for your training + try it CTA',
        hashtagCount: 5,
        visualStyle: 'Watch face screenshots, clean data graphics, blue accents'
      },
      {
        type: 'community',
        description: 'User adventure photos with Garmin watch in frame',
        engagementLevel: 'high',
        captionFormula: 'Adventure hook + featured user story + share yours CTA',
        hashtagCount: 5,
        visualStyle: 'Outdoor adventure photography, watch product shots'
      },
      {
        type: 'carousel',
        description: 'Training plan breakdowns and race preparation guides',
        engagementLevel: 'high',
        captionFormula: 'Training goal + step-by-step guide + save CTA',
        hashtagCount: 5,
        visualStyle: 'Clean infographics, blue/black brand colors'
      }
    ],
    hashtagStrategy: {
      branded: ['#Garmin', '#GarminRunning', '#BeatYesterday'],
      reach: ['#Running', '#TrailRunning', '#Marathon', '#FitnessData', '#RunningWatch'],
      niche: ['#VO2Max', '#HeartRateTraining', '#TrainingPlan', '#RunningMetrics', '#GPSWatch']
    },
    captionStyle: {
      tone: 'Technical, enthusiastic, data-informed',
      avgLength: '80-180 words',
      structure: 'Data hook + explanation + practical application + CTA',
      ctaPatterns: ['Beat yesterday', 'What does your data tell you?', 'Share your Garmin adventure', 'Tag a data-driven runner']
    },
    visualStyle: {
      colors: ['#007CC3', '#000000', '#FFFFFF', '#00A5E3'],
      imageryType: ['Watch product shots', 'Data dashboards', 'Outdoor adventures', 'Training screenshots'],
      textOverlay: true,
      logoPlacement: 'Bottom-right, blue accent'
    },
    winningFormulas: [
      'Data-driven training insights that make runners feel smart',
      '"Your watch is telling you X - here is what it means"',
      'Epic adventure photography with watch in frame',
      'Race day prep checklists that get saved thousands of times',
      'Before/after training stats showing improvement'
    ]
  },
  {
    name: 'COROS',
    handle: '@corosexplore',
    followers: '243K',
    brand: 'pacebrain',
    postingFrequency: '4-5 posts/week',
    bestPostingTimes: ['7:00 AM', '1:00 PM', '6:00 PM'],
    topContentTypes: [
      {
        type: 'reel',
        description: 'Trail running and ultra-marathon athlete footage',
        engagementLevel: 'viral',
        captionFormula: 'Epic adventure hook + athlete story + brand mention',
        hashtagCount: 5,
        visualStyle: 'Dramatic landscapes, trail running, golden hour'
      },
      {
        type: 'community',
        description: 'Athlete partnerships and sponsored runner achievements',
        engagementLevel: 'high',
        captionFormula: 'Achievement celebration + training journey + community',
        hashtagCount: 5,
        visualStyle: 'Action sports photography, mountain landscapes'
      },
      {
        type: 'tip',
        description: 'Training mode tutorials and watch feature guides',
        engagementLevel: 'medium',
        captionFormula: 'Feature highlight + how it helps + try it CTA',
        hashtagCount: 5,
        visualStyle: 'Screen recordings, product close-ups, clean graphics'
      }
    ],
    hashtagStrategy: {
      branded: ['#COROS', '#COROSExplore', '#ExplorePerfection'],
      reach: ['#TrailRunning', '#UltraMarathon', '#Running', '#OutdoorAdventure', '#EnduranceSport'],
      niche: ['#MountainRunning', '#TrailLife', '#RunWild', '#UltraRunner', '#TrailCommunity']
    },
    captionStyle: {
      tone: 'Adventurous, athletic, aspirational',
      avgLength: '60-150 words',
      structure: 'Adventure hook + athlete feature + exploration invitation',
      ctaPatterns: ['Where will you explore next?', 'Push your limits', 'Join the COROS community', 'Tag your trail buddy']
    },
    visualStyle: {
      colors: ['#E63946', '#1D3557', '#F1FAEE', '#457B9D'],
      imageryType: ['Mountain/trail landscapes', 'Action sports', 'Dawn/dusk lighting', 'Epic scenery'],
      textOverlay: true,
      logoPlacement: 'Bottom-right, small'
    },
    winningFormulas: [
      'Breathtaking trail/mountain running photography',
      'Ultra-marathon stories that inspire regular runners',
      'Watch features explained through real training scenarios',
      '"Sunday long run" community posts with epic scenery',
      'Data meets adventure - combining stats with beautiful locations'
    ]
  }
];

export const optimalPostingTimes = {
  affectly: {
    weekday: ['7:00 AM', '12:00 PM', '7:00 PM', '9:00 PM'],
    weekend: ['9:00 AM', '11:00 AM', '7:00 PM'],
    bestDays: ['Tuesday', 'Wednesday', 'Sunday'],
    reasoning: 'Mental health content performs best mornings (intention-setting), lunch (break scrolling), evenings 5-9 PM (unwind time = highest engagement). Wednesday is peak day for wellness content. DM shares weighted 3-5x by algorithm — create "send this to a friend" moments.'
  },
  pacebrain: {
    weekday: ['6:00 AM', '12:00 PM', '5:00 PM', '7:00 PM'],
    weekend: ['8:00 AM', '10:00 AM', '5:00 PM'],
    bestDays: ['Tuesday', 'Wednesday', 'Saturday'],
    reasoning: 'Runners engage early mornings 6-8 AM (pre-run motivation), evenings 5-7 PM (post-workout review). Tuesday-Wednesday are peak days. Saturday for long run content. 50%+ of Gen Z increasing Strava usage — lean into community.'
  }
};

export const instagram2026Insights = {
  hashtagLimit: '5 hashtags max (Instagram 2026 change — some accounts testing 3)',
  keyStrategy: 'Keyword-rich captions generate 30% more reach than hashtag-heavy posts',
  hashtagPlacement: 'Place in caption (not comments) for immediate algorithm indexing',
  hashtagRotation: 'Rotate 3-4 hashtag sets to avoid spam detection',
  contentMix: '60-70% Reels (under 60s), 20-30% Carousels (save-driven), 10% Single images',
  carouselPerformance: 'Carousels earn 109% more engagement per person reached than Reels',
  engagementTrend: 'Platform engagement dropped 24% YoY — quality over quantity is critical',
  algorithmPriority: 'DM shares weighted 3-5x higher than likes. Watch time is #1 ranking factor.',
  topFormats: [
    'Reels under 60 seconds (platform priority)',
    'Educational carousels (built for saves)',
    'Interactive content — polls, Q&As, stickers (boost engagement 20%+)',
    'User-generated content and testimonials',
    'Behind-the-scenes / "unfiltered" content',
    'Memes and humor-infused posts',
    'Edutainment (top category users actively seek out)',
  ],
};

export const hashtagSets = {
  affectly: {
    branded: ['#Affectly', '#AffectlyApp'],
    tier1_reach: ['#MentalHealth', '#SelfCare', '#Mindfulness', '#Wellness', '#MentalHealthMatters'],
    tier2_medium: ['#MentalHealthAwareness', '#TherapyWorks', '#MindfulLiving', '#EmotionalWellness', '#InnerPeace'],
    tier3_niche: ['#MentalHealthApp', '#AIWellness', '#DigitalMentalHealth', '#CopingStrategies', '#MindfulnessApp'],
    recommended: 'Instagram 2026: MAX 5 hashtags. Use 1 branded + 2 reach + 2 niche. Rotate sets each post. Focus on keyword-rich captions instead — 30% more reach.'
  },
  pacebrain: {
    branded: ['#PaceBrain', '#PaceBrainApp'],
    tier1_reach: ['#Running', '#Marathon', '#RunnerLife', '#FitnessMotivation', '#TrailRunning', '#RunningCommunity'],
    tier2_medium: ['#RunningTraining', '#MarathonTraining', '#RunningTips', '#TrainingPlan', '#RunFaster'],
    tier3_niche: ['#AIRunCoach', '#SmartTraining', '#RunningData', '#PaceTraining', '#RunningApp'],
    recommended: 'Instagram 2026: MAX 5 hashtags. Use 1 branded + 2 reach + 2 niche. Rotate sets each post. Focus on keyword-rich captions instead — 30% more reach.'
  }
};

export const contentTemplates = {
  affectly: [
    {
      type: 'quote' as const,
      title: 'Daily Affirmation',
      template: 'A calming, empowering affirmation with soft gradient background and Affectly logo',
      captionStructure: 'Affirmation expansion (2-3 sentences) + "How are you taking care of your mind today?" + hashtags',
      visualNotes: 'Soft teal/coral gradients matching Affectly brand colors, centered white text, logo bottom-right'
    },
    {
      type: 'tip' as const,
      title: 'Mental Health Tip',
      template: 'Evidence-based coping strategy with clean infographic layout',
      captionStructure: 'Problem acknowledgment + 3-step solution + encouraging close + hashtags',
      visualNotes: 'Clean layout, numbered steps, Affectly brand colors (teal, coral, gold)'
    },
    {
      type: 'carousel' as const,
      title: 'Wellness Guide',
      template: '5-slide carousel with consistent brand styling',
      captionStructure: 'Hook question + "Swipe for..." + detailed explanation + save CTA + hashtags',
      visualNotes: 'Consistent slides, teal backgrounds, white text, brain/heart icons'
    },
    {
      type: 'community' as const,
      title: 'You Are Not Alone',
      template: 'Relatable mental health moment with supportive message',
      captionStructure: 'Relatable opening + normalize the experience + Affectly solution + hashtags',
      visualNotes: 'Warm photography, text overlay with supportive message'
    },
    {
      type: 'promo' as const,
      title: 'App Feature Highlight',
      template: 'Showcase a specific Affectly feature with benefit-focused copy',
      captionStructure: 'Pain point + how Affectly helps + CTA to download + hashtags',
      visualNotes: 'App screenshots or mockups, feature callouts, brand colors'
    }
  ],
  pacebrain: [
    {
      type: 'quote' as const,
      title: 'Running Motivation',
      template: 'Bold motivational text on dramatic running/landscape imagery',
      captionStructure: 'Motivational expansion + personal touch + "What is pushing you today?" + hashtags',
      visualNotes: 'High contrast, bold typography, sunrise/sunset running imagery, PaceBrain logo'
    },
    {
      type: 'tip' as const,
      title: 'Training Tip',
      template: 'Data-backed training advice with clean infographic',
      captionStructure: 'Training insight + explanation + how to apply + hashtags',
      visualNotes: 'Clean data graphics, dark blue brand colors, training metrics'
    },
    {
      type: 'carousel' as const,
      title: 'Race Prep Guide',
      template: '5-slide guide for race preparation or training plans',
      captionStructure: 'Race distance hook + "Swipe for your guide" + detailed tips + save CTA + hashtags',
      visualNotes: 'Consistent dark blue slides, running icons, step-by-step layout'
    },
    {
      type: 'community' as const,
      title: 'Runner Spotlight',
      template: 'Celebrate a running achievement or milestone',
      captionStructure: 'Achievement highlight + the journey behind it + community encouragement + hashtags',
      visualNotes: 'Action running photography, achievement overlay, PaceBrain branding'
    },
    {
      type: 'promo' as const,
      title: 'Smart Training Feature',
      template: 'Showcase PaceBrain AI training features',
      captionStructure: 'Training challenge + how PaceBrain solves it + CTA to try + hashtags',
      visualNotes: 'App screenshots, training plan visuals, brand colors'
    }
  ]
};
