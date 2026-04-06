import Link from 'next/link';
import {
  Sparkles,
  CalendarClock,
  Users,
  BarChart3,
  ArrowRight,
  Zap,
  Target,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

function Logo() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-500">
      <span className="text-base font-bold text-white">S</span>
    </div>
  );
}

function GridPattern() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Dot grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.03]"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="grid-dots"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-dots)" />
      </svg>
      {/* Radial glow behind hero */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[720px] w-[720px] rounded-full bg-teal-500/[0.07] blur-[120px]" />
      <div className="absolute right-0 top-48 h-[480px] w-[480px] rounded-full bg-blue-500/[0.05] blur-[100px]" />
    </div>
  );
}

const features = [
  {
    icon: Sparkles,
    title: 'AI Content Creation',
    description:
      'Generate scroll-stopping captions, find the perfect images, and add branded overlays. From idea to post in seconds.',
    accent: 'from-teal-500/20 to-teal-500/5',
    iconColor: 'text-teal-400',
  },
  {
    icon: CalendarClock,
    title: 'Smart Scheduling',
    description:
      'Schedule posts to Buffer at the times your audience is most active. Data-driven timing, zero guesswork.',
    accent: 'from-blue-500/20 to-blue-500/5',
    iconColor: 'text-blue-400',
  },
  {
    icon: Users,
    title: 'Competitor Intelligence',
    description:
      'See what your competitors post, when they post, and what works for them. Then do it better.',
    accent: 'from-orange-500/20 to-orange-500/5',
    iconColor: 'text-orange-400',
  },
  {
    icon: BarChart3,
    title: 'Analytics That Talk',
    description:
      'No spreadsheets. Get plain-English insights with a Health Score that tells you exactly what to fix next.',
    accent: 'from-violet-500/20 to-violet-500/5',
    iconColor: 'text-violet-400',
  },
];

const steps = [
  {
    number: '01',
    icon: Zap,
    title: 'Connect your accounts',
    description:
      'Link Buffer, Instagram, and your image sources. One-time setup, then you are good to go.',
  },
  {
    number: '02',
    icon: Target,
    title: 'Create and schedule',
    description:
      'Generate content with AI assistance and schedule posts at optimal times based on real data.',
  },
  {
    number: '03',
    icon: TrendingUp,
    title: 'Analyze and improve',
    description:
      'Your Health Score shows what is working and what is not. Actionable insights, not vanity metrics.',
  },
];

const stats = [
  { value: '500+', label: 'Posts scheduled' },
  { value: '10x', label: 'Faster than manual' },
  { value: '100%', label: 'Data-driven decisions' },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <GridPattern />

      {/* ── Navigation ── */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-base font-semibold tracking-tight">
              Social Studio
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-teal-400"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-20 sm:pb-32 sm:pt-28 lg:pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs font-medium text-zinc-400 backdrop-blur-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400" />
            Now in beta — free to use
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Automate Your Instagram.{' '}
            <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              Outsmart Your Competitors.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Create stunning content, schedule posts, and analyze what works. All
            in one place, powered by AI.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 hover:brightness-110"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-7 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-700 hover:text-white"
            >
              See How It Works
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
        <div className="mb-14 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-400">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to win on Instagram
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-7 backdrop-blur-sm transition-colors hover:border-zinc-700/60 hover:bg-zinc-900/60"
              >
                {/* Subtle gradient glow on hover */}
                <div
                  className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.accent} opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative">
                  <div
                    className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800/60 bg-zinc-900 ${feature.iconColor}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-zinc-100">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="relative z-10 mx-auto max-w-6xl px-6 pb-24 sm:pb-32"
      >
        <div className="mb-14 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-400">
            How It Works
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps to better content
          </h2>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="relative text-center">
                {/* Step number */}
                <span className="mb-5 inline-block text-5xl font-black tracking-tighter text-zinc-800/80">
                  {step.number}
                </span>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800/60 bg-zinc-900 text-teal-400">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-zinc-100">
                  {step.title}
                </h3>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-zinc-500">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Social Proof / Stats ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-10 backdrop-blur-sm sm:p-14">
          <p className="mb-10 text-center text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Trusted by creators and brands
          </p>
          <div className="grid grid-cols-3 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-zinc-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32 sm:pb-40">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-8 py-16 text-center backdrop-blur-sm sm:px-16 sm:py-20">
          {/* Background glow */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/[0.08] blur-[80px]" />
          </div>
          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to dominate Instagram?
            </h2>
            <p className="mx-auto mb-8 max-w-md text-zinc-400">
              Join creators and brands who use Social Studio to create better
              content, faster.
            </p>
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 hover:brightness-110"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-4 text-xs text-zinc-600">
              No credit card required
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
              Social Studio
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-zinc-500">
            <Link
              href="/login"
              className="transition-colors hover:text-zinc-300"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="transition-colors hover:text-zinc-300"
            >
              Register
            </Link>
          </nav>
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} Social Studio
          </p>
        </div>
      </footer>
    </div>
  );
}
