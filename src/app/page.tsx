import Link from 'next/link';
import Image from 'next/image';
import {
  Sparkles,
  Users,
  BarChart3,
  ArrowRight,
  Zap,
  Target,
  TrendingUp,
  ChevronRight,
  Brain,
  Eye,
  Layers,
  Search,
  MousePointerClick,
} from 'lucide-react';

function Logo() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-500">
      <span className="text-base font-bold text-white">G</span>
    </div>
  );
}

function GridPattern() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full opacity-[0.03]" aria-hidden="true">
        <defs>
          <pattern id="grid-dots" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dots)" />
      </svg>
      <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[720px] w-[720px] rounded-full bg-teal-500/[0.07] blur-[120px]" />
      <div className="absolute right-0 top-48 h-[480px] w-[480px] rounded-full bg-blue-500/[0.05] blur-[100px]" />
      <div className="absolute left-0 bottom-0 h-[480px] w-[480px] rounded-full bg-purple-500/[0.04] blur-[100px]" />
    </div>
  );
}

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Captions',
    description: 'Generate unique captions for every post using AI that learns from your top-performing content and competitor strategies. Not templates. Not recycled copy. Fresh every time.',
    accent: 'from-teal-500/20 to-teal-500/5',
    iconColor: 'text-teal-400',
    tag: 'Powered by Cerebras AI',
  },
  {
    icon: Search,
    title: 'Auto-Find Competitors',
    description: 'Enter your Instagram handle and we search the web to find your real competitors. Then we scrape their profiles to learn what content works in your niche.',
    accent: 'from-purple-500/20 to-purple-500/5',
    iconColor: 'text-purple-400',
    tag: 'Web search + AI',
  },
  {
    icon: Eye,
    title: 'Competitor Intelligence',
    description: 'See follower counts, posting frequency, top hashtags, and engagement rates for every competitor. AI analyzes the data and tells you exactly how to beat them.',
    accent: 'from-orange-500/20 to-orange-500/5',
    iconColor: 'text-orange-400',
    tag: 'Instagram scraping',
  },
  {
    icon: BarChart3,
    title: 'Visual Analytics',
    description: 'Health Score gauge, timing heatmaps, content mix charts, and hashtag performance. See your Instagram data as visual insights, not spreadsheets.',
    accent: 'from-blue-500/20 to-blue-500/5',
    iconColor: 'text-blue-400',
    tag: 'Recharts + AI insights',
  },
  {
    icon: Layers,
    title: 'Batch Create 20 Posts',
    description: 'Generate 20 ready-to-post images with AI captions, branded overlays, and optimized hashtags in one click. Each post gets a unique AI-picked image.',
    accent: 'from-pink-500/20 to-pink-500/5',
    iconColor: 'text-pink-400',
    tag: 'Pixabay + AI curation',
  },
  {
    icon: MousePointerClick,
    title: 'One-Click to Buffer',
    description: 'Schedule directly to Buffer with branded image overlays, auto-generated captions, and smart timing. From idea to scheduled post in under 30 seconds.',
    accent: 'from-emerald-500/20 to-emerald-500/5',
    iconColor: 'text-emerald-400',
    tag: 'Buffer integration',
  },
];

const steps = [
  {
    number: '01',
    icon: Zap,
    title: 'Connect your Instagram',
    description: 'Add your Instagram handle and connect Buffer for scheduling. We start scanning your profile immediately.',
  },
  {
    number: '02',
    icon: Target,
    title: 'Discover your competitors',
    description: 'AI finds 10 real competitors in your niche. We scrape their profiles to learn what content performs best.',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Create smarter content',
    description: 'AI generates captions informed by your analytics and competitor data. Pick the best image. Schedule it. Done.',
  },
  {
    number: '04',
    icon: TrendingUp,
    title: 'Track and improve',
    description: 'Your Health Score and AI insights update after every sync. See what is working and double down on it.',
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <GridPattern />
      {/* Ambient glow matching hero image colors */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 top-0 h-[600px] w-[600px] rounded-full bg-pink-500/[0.04] blur-[120px]" />
        <div className="absolute right-0 top-0 h-[600px] w-[600px] rounded-full bg-cyan-500/[0.04] blur-[120px]" />
      </div>

      {/* ── Navigation ── */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4 sm:py-5">
          <Link href="/" className="flex items-center gap-2" aria-label="GoViraleza home">
            <Logo />
            <span className="text-sm sm:text-base font-semibold tracking-tight">
              GoViraleza
            </span>
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-teal-500 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white transition-all hover:bg-teal-400"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pb-28 sm:pt-24 lg:pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs font-medium text-zinc-400 backdrop-blur-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
            Open beta — free while we build
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Create Instagram content{' '}
            <span className="bg-gradient-to-r from-teal-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              your competitors wish they had.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            GoViraleza uses AI to generate captions, find the right images, discover your competitors, and tell you exactly what to post and when. Built for Instagram creators and brands who want to grow with data, not guesswork.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 hover:brightness-110"
            >
              Start for Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-7 py-3.5 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-700 hover:text-white"
            >
              See What It Does
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>

          {/* Hero Image */}
          <div className="relative mt-16 mx-auto max-w-4xl">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-teal-500/20 via-purple-500/20 to-pink-500/20 blur-2xl opacity-60" />
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800/50 shadow-2xl shadow-teal-500/10">
              <Image
                src="/hero-goviraleza.png"
                alt="GoViraleza - Social media content creation platform"
                width={1200}
                height={600}
                className="w-full h-auto"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/60 via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* ── What It Actually Does (honest feature list) ── */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
        <div className="mb-14 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-400">
            What You Get
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Every tool you need. Nothing you don&apos;t.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400">
            No fluff, no vanity metrics. Real AI-powered tools that help you create better content and understand your market.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-7 backdrop-blur-sm transition-colors hover:border-zinc-700/60 hover:bg-zinc-900/60"
              >
                <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.accent} opacity-0 transition-opacity group-hover:opacity-100`} />
                <div className="relative">
                  <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800/60 bg-zinc-900 ${feature.iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-zinc-100">
                    {feature.title}
                  </h3>
                  <p className="mb-3 text-sm leading-relaxed text-zinc-400">
                    {feature.description}
                  </p>
                  <span className="inline-flex items-center rounded-full bg-zinc-800/60 px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                    {feature.tag}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
        <div className="mb-14 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-400">
            How It Works
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From zero to scheduled in 4 steps
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="relative rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 text-center">
                <span className="mb-4 inline-block text-4xl font-black tracking-tighter text-zinc-800">
                  {step.number}
                </span>
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800/60 bg-zinc-900 text-teal-400">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-zinc-100">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-500">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Built With (honest tech stack) ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-10 backdrop-blur-sm sm:p-14">
          <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            What powers GoViraleza
          </h2>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: 'AI Captions', detail: 'Cerebras LLM generates unique content for every post' },
              { label: 'Image Search', detail: 'Pixabay integration with AI-powered image selection' },
              { label: 'Scheduling', detail: 'Buffer API for direct Instagram posting' },
              { label: 'Scraping', detail: 'Instagram profile data via public HTML endpoints' },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <p className="text-base font-bold text-zinc-100">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32 sm:pb-40">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-8 py-16 text-center backdrop-blur-sm sm:px-16 sm:py-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/[0.08] blur-[80px]" />
          </div>
          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to create smarter content?
            </h2>
            <p className="mx-auto mb-8 max-w-lg text-zinc-400">
              GoViraleza is free during beta. Connect your Instagram, discover your competitors, and start creating AI-powered content today.
            </p>
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 hover:brightness-110"
            >
              Create Your Free Account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-4 text-xs text-zinc-600">
              No credit card. No trial limits. Free while in beta.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-zinc-800/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-10 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-sm font-semibold tracking-tight text-zinc-400">
              GoViraleza
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-zinc-500">
            <Link href="/login" className="transition-colors hover:text-zinc-300">Login</Link>
            <Link href="/register" className="transition-colors hover:text-zinc-300">Register</Link>
          </nav>
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} GoViraleza
          </p>
        </div>
      </footer>
    </div>
  );
}
