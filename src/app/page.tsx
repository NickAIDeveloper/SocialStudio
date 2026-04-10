import Link from 'next/link';
import Image from 'next/image';
import {
  Sparkles,
  BarChart3,
  ArrowRight,
  Zap,
  Target,
  TrendingUp,
  Brain,
  Eye,
  Layers,
  Search,
  MousePointerClick,
  CheckCircle2,
  Globe,
  Calendar,
  Shield,
  Cpu,
} from 'lucide-react';

/* ── Reusable Components ───────────────────────────────────── */

function Logo() {
  return (
    <Image
      src="/logo-goviraleza.png"
      alt="GoViraleza"
      width={36}
      height={25}
      className="shrink-0 rounded-md"
    />
  );
}

function GradientText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`bg-gradient-to-r from-teal-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent ${className}`}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-teal-400">
      {children}
    </p>
  );
}

/* ── Data ──────────────────────────────────────────────────── */

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Captions',
    description: 'Generate unique captions tailored to your brand voice, informed by competitor analysis and your best-performing content.',
    gradient: 'from-teal-500/20 via-teal-500/5 to-transparent',
    glow: 'group-hover:shadow-teal-500/10',
  },
  {
    icon: Search,
    title: 'Competitor Discovery',
    description: 'AI finds your real competitors on Instagram and analyzes their profiles to learn what content works in your niche.',
    gradient: 'from-purple-500/20 via-purple-500/5 to-transparent',
    glow: 'group-hover:shadow-purple-500/10',
  },
  {
    icon: Eye,
    title: 'Competitor Intelligence',
    description: 'Follower counts, posting frequency, top hashtags, and engagement rates. Know exactly what your competitors are doing.',
    gradient: 'from-orange-500/20 via-orange-500/5 to-transparent',
    glow: 'group-hover:shadow-orange-500/10',
  },
  {
    icon: BarChart3,
    title: 'Visual Analytics',
    description: 'Health Score, timing heatmaps, content mix analysis, and hashtag performance. Your data as actionable insights.',
    gradient: 'from-blue-500/20 via-blue-500/5 to-transparent',
    glow: 'group-hover:shadow-blue-500/10',
  },
  {
    icon: Layers,
    title: 'Batch Content Creation',
    description: 'Generate 5 to 20 posts at once with AI captions, branded image overlays, and optimized hashtags.',
    gradient: 'from-pink-500/20 via-pink-500/5 to-transparent',
    glow: 'group-hover:shadow-pink-500/10',
  },
  {
    icon: MousePointerClick,
    title: 'One-Click Scheduling',
    description: 'Schedule directly to Buffer with branded overlays and smart timing. Idea to scheduled post in seconds.',
    gradient: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
    glow: 'group-hover:shadow-emerald-500/10',
  },
];

const steps = [
  { number: '01', icon: Globe, title: 'Connect', description: 'Add your Instagram handle and connect Buffer for scheduling.' },
  { number: '02', icon: Target, title: 'Discover', description: 'AI finds your top 10 competitors and scrapes their strategy.' },
  { number: '03', icon: Sparkles, title: 'Create', description: 'Generate AI captions with images, hooks, and branded overlays.' },
  { number: '04', icon: Calendar, title: 'Schedule', description: 'One-click to Buffer. Track performance with Health Score.' },
];

const marqueeItems = [
  'AI Caption Generation',
  'Competitor Scraping',
  'Visual Analytics',
  'Batch Post Creation',
  'Brand Voice AI',
  'Hook Text Overlays',
  'Buffer Scheduling',
  'Hashtag Optimization',
  'Health Score Tracking',
  'Content Type Templates',
];

/* ── Page ──────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[#09090b] text-zinc-100 overflow-x-hidden">

      {/* ── Background Mesh ── */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-0 left-1/4 h-[1000px] w-[1000px] rounded-full bg-teal-600/[0.04] blur-[200px]" />
        <div className="absolute top-[30%] right-0 h-[800px] w-[800px] rounded-full bg-purple-600/[0.03] blur-[180px]" />
        <div className="absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-blue-600/[0.03] blur-[150px]" />
        <div className="absolute top-[60%] left-1/2 h-[500px] w-[500px] rounded-full bg-pink-600/[0.02] blur-[120px]" />
      </div>

      {/* ── Sticky Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/70 backdrop-blur-2xl">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-teal-500/40 to-transparent" />
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="GoViraleza home">
            <Logo />
            <span className="text-lg font-bold tracking-tight">GoViraleza</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-500">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-white">How It Works</a>
            <a href="#tech" className="transition-colors hover:text-white">Technology</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:text-white">
              Sign in
            </Link>
            <Link href="/register" className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-all hover:bg-zinc-200 shadow-lg shadow-white/10">
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-24 pb-8 sm:pt-32 lg:pt-40">
        <div className="mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div className="mb-10 inline-flex items-center gap-2.5 rounded-full border border-teal-500/20 bg-teal-500/[0.06] px-5 py-2.5 text-sm font-medium text-teal-300 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
            </span>
            Free during beta
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-[5.5rem]">
            Create <GradientText className="font-black">20 posts</GradientText> in<br className="hidden sm:block" />
            under 5 minutes
          </h1>

          {/* Sub */}
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            AI-powered captions, competitor intelligence, and one-click scheduling. Create Instagram content backed by real data from your market.
          </p>

          {/* CTAs */}
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="group relative inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-400 px-10 py-4.5 text-base font-bold text-white shadow-2xl shadow-teal-500/30 transition-all hover:shadow-teal-500/50 hover:scale-[1.02]"
            >
              <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-teal-400 to-cyan-300 opacity-0 transition-opacity group-hover:opacity-100 blur-xl" />
              <span className="relative flex items-center gap-2.5">
                Get Started Free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-700/50 bg-zinc-900/50 px-8 py-4.5 text-base font-semibold text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800/50 hover:text-white backdrop-blur-sm"
            >
              Explore Features
            </a>
          </div>

          {/* No credit card notice */}
          <p className="mt-6 text-sm text-zinc-600">No credit card required. Set up in 2 minutes.</p>
        </div>
      </section>

      {/* ── Scrolling Marquee ── */}
      <section className="relative z-10 py-12 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#09090b] to-transparent z-10" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#09090b] to-transparent z-10" />
        <div className="flex animate-[scroll_30s_linear_infinite] gap-6 whitespace-nowrap">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-800/60 bg-zinc-900/40 px-5 py-2.5 text-sm text-zinc-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-500/70" />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ── Hero Image ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="relative mx-auto max-w-5xl">
          {/* Outer glow */}
          <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-r from-teal-500/10 via-purple-500/10 to-pink-500/10 blur-3xl opacity-60" />
          {/* Glass frame */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/30 shadow-2xl shadow-black/40 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />
            <Image
              src="/hero-goviraleza.png"
              alt="GoViraleza platform"
              width={1200}
              height={600}
              className="relative w-full h-auto"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent opacity-70" />
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-32">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { value: '5', label: 'Content Types', sub: 'Promo, Quote, Tips, Community, Carousel' },
            { value: '20', label: 'Posts Per Batch', sub: 'AI-generated with unique images' },
            { value: '10', label: 'Competitors Tracked', sub: 'Auto-discovered and analyzed' },
            { value: '<30s', label: 'Time to Schedule', sub: 'One-click Buffer integration' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all duration-500 hover:border-teal-500/20 hover:bg-teal-500/[0.03]"
            >
              <p className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-bold text-zinc-300">{stat.label}</p>
              <p className="mt-1 text-[11px] text-zinc-600 leading-snug">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 pb-32 sm:pb-40">
        <div className="mb-20 text-center">
          <SectionLabel>Features</SectionLabel>
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Everything you need to{' '}
            <GradientText>win on Instagram</GradientText>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-zinc-500 leading-relaxed">
            Real tools that analyze your market, generate content, and schedule posts. Built for results, not vanity metrics.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all duration-500 hover:border-white/[0.1] hover:shadow-2xl ${feature.glow}`}
              >
                {/* Hover gradient */}
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

                <div className="relative">
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-teal-400 transition-colors group-hover:border-teal-500/30 group-hover:bg-teal-500/10">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-white">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-500 group-hover:text-zinc-400 transition-colors">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="relative z-10 mx-auto max-w-7xl px-6 pb-32 sm:pb-40">
        <div className="mb-20 text-center">
          <SectionLabel>How It Works</SectionLabel>
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            Four steps. Zero guesswork.
          </h2>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="pointer-events-none absolute top-20 left-[calc(12.5%+28px)] right-[calc(12.5%+28px)] hidden lg:block">
            <div className="h-px bg-gradient-to-r from-teal-500/30 via-purple-500/30 to-cyan-500/30" />
          </div>

          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="relative text-center">
                  {/* Step number */}
                  <p className="mb-4 text-6xl font-black text-white/[0.04] tracking-tighter leading-none">
                    {step.number}
                  </p>
                  {/* Icon */}
                  <div className="relative z-10 mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-teal-400 shadow-lg shadow-black/30">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-white">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-500">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Skip Section (Comparison) ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-32 sm:pb-40">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>Why GoViraleza</SectionLabel>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl mb-6">
            Skip the guesswork.<br />
            <span className="text-zinc-500">Skip the spreadsheets.</span><br />
            <span className="text-zinc-600">Skip the content calendar chaos.</span>
          </h2>
          <p className="text-base text-zinc-400 leading-relaxed mb-10">
            Most brands waste hours switching between analytics tools, caption generators, image libraries, and scheduling apps. GoViraleza replaces them all with one AI-powered workflow.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { before: 'Manually research competitors', after: 'AI finds and tracks 10 competitors automatically' },
              { before: 'Write captions from scratch', after: 'AI generates captions informed by your data' },
              { before: 'Guess the best posting time', after: 'Analytics show your peak engagement times' },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-red-400/70 mb-2">Before</p>
                <p className="text-sm text-zinc-500 mb-4">{item.before}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-teal-400 mb-2">With GoViraleza</p>
                <p className="text-sm text-zinc-200">{item.after}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-32 sm:pb-40">
        <div className="mb-16 text-center">
          <SectionLabel>Built For</SectionLabel>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Who uses GoViraleza?
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { emoji: '📱', title: 'App Founders', description: 'Generate consistent Instagram content for your app without hiring a social media manager.' },
            { emoji: '🏪', title: 'Small Businesses', description: 'Compete with bigger brands by using AI to create content informed by what already works in your niche.' },
            { emoji: '🎯', title: 'Marketing Teams', description: 'Batch create weeks of content in minutes. Focus your team on strategy, not caption writing.' },
            { emoji: '🎨', title: 'Creators and Coaches', description: 'Build your personal brand with AI-powered posts that match your voice and outperform competitors.' },
            { emoji: '🛒', title: 'E-commerce Brands', description: 'Create promo, community, and educational content that drives traffic from Instagram to your store.' },
            { emoji: '🏢', title: 'Agencies', description: 'Manage multiple brand accounts with separate voice settings, competitor tracking, and analytics per brand.' },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.04]">
              <span className="text-2xl mb-3 block">{item.emoji}</span>
              <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-32 sm:pb-40">
        <div className="mb-16 text-center">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Common questions
          </h2>
        </div>
        <div className="mx-auto max-w-3xl space-y-4">
          {[
            { q: 'Is GoViraleza really free?', a: 'Yes. During our beta period, all features are completely free with no credit card required. We will introduce paid plans in the future with advance notice.' },
            { q: 'How does the AI generate captions?', a: 'Our AI analyzes your brand description, competitor data, and your best-performing content to generate unique captions tailored to your voice. Each caption is informed by real market data, not generic templates.' },
            { q: 'What Instagram data do you access?', a: 'We only access publicly available profile data like follower counts, post counts, and public post captions. We never access private messages, stories, or require your Instagram login credentials.' },
            { q: 'Can I manage multiple Instagram accounts?', a: 'Yes. You can add multiple brands, each with their own Instagram handle, brand voice settings, competitor tracking, and analytics. Content is generated specifically for each brand.' },
            { q: 'How does scheduling work?', a: 'We integrate with Buffer for scheduling. Connect your Buffer account in Settings, then schedule posts directly from the Create or Batch pages with one click.' },
            { q: 'Do I own the content I create?', a: 'Absolutely. You retain full ownership of all content generated through GoViraleza. See our Terms of Service for details.' },
          ].map((item) => (
            <div key={item.q} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <h3 className="text-base font-bold text-white mb-2">{item.q}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Technology ── */}
      <section id="tech" className="relative z-10 mx-auto max-w-7xl px-6 pb-32 sm:pb-40">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.06]">
          {/* Inner glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-teal-500/[0.04] via-transparent to-purple-500/[0.04]" />

          <div className="relative px-8 py-16 sm:px-16 sm:py-20">
            <div className="text-center mb-14">
              <SectionLabel>Technology</SectionLabel>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Built with serious infrastructure
              </h2>
              <p className="mt-3 text-sm text-zinc-500">The engine behind every post, insight, and recommendation</p>
            </div>

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Cpu, label: 'AI Engine', detail: 'LLM-powered captions with brand context, competitor insights, and content-type templates' },
                { icon: Search, label: 'Image Intelligence', detail: 'AI selects the best stock image for each caption from connected image sources' },
                { icon: TrendingUp, label: 'Analytics', detail: 'Health Score, posting timing, hashtag performance, and content mix analysis' },
                { icon: Shield, label: 'Scheduling', detail: 'Direct Buffer integration with branded image overlays and smart time slots' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="text-center group">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-teal-400 transition-all group-hover:border-teal-500/20 group-hover:bg-teal-500/[0.06]">
                      <Icon className="h-6 w-6" />
                    </div>
                    <p className="text-lg font-bold text-white">{item.label}</p>
                    <p className="mt-2 text-xs text-zinc-500 leading-relaxed max-w-[200px] mx-auto">{item.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-32 sm:pb-40">
        <div className="relative overflow-hidden rounded-3xl">
          {/* Rich gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-teal-600/20 via-[#09090b] to-purple-600/20" />
          <div className="absolute inset-0 border border-white/[0.06] rounded-3xl" />

          {/* Glow orbs */}
          <div className="pointer-events-none absolute top-0 left-1/4 h-[300px] w-[300px] rounded-full bg-teal-500/[0.1] blur-[100px]" />
          <div className="pointer-events-none absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-purple-500/[0.08] blur-[100px]" />

          <div className="relative px-8 py-24 text-center sm:px-16 sm:py-32">
            <SectionLabel>Get Started</SectionLabel>
            <h2 className="mb-5 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              Ready to outperform<br className="hidden sm:block" /> your competition?
            </h2>
            <p className="mx-auto mb-12 max-w-lg text-base text-zinc-400 leading-relaxed">
              Join during beta and get full access for free. No credit card, no trial limits.
            </p>
            <Link
              href="/register"
              className="group relative inline-flex items-center gap-2.5 rounded-2xl bg-white px-12 py-5 text-base font-bold text-zinc-900 shadow-2xl shadow-white/10 transition-all hover:shadow-white/20 hover:scale-[1.02]"
            >
              Create Your Free Account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="mt-6 text-sm text-zinc-600">
              Free forever during beta. Takes 2 minutes to set up.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <Logo />
                <span className="text-lg font-bold tracking-tight">GoViraleza</span>
              </div>
              <p className="text-sm text-zinc-600 leading-relaxed">
                AI-powered Instagram content creation and competitor intelligence. Built for brands and creators who want to grow with data, not guesswork.
              </p>
            </div>

            <div className="flex flex-wrap gap-10 sm:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Product</p>
                <div className="flex flex-col gap-3">
                  <a href="#features" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">Features</a>
                  <a href="#how-it-works" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">How It Works</a>
                  <a href="#tech" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">Technology</a>
                  <Link href="/register" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">Get Started</Link>
                </div>
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Account</p>
                <div className="flex flex-col gap-3">
                  <Link href="/login" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">Sign In</Link>
                  <Link href="/register" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">Register</Link>
                </div>
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Legal</p>
                <div className="flex flex-col gap-3">
                  <Link href="/terms" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">Terms of Service</Link>
                  <Link href="/privacy" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">Privacy Policy</Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-14 pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-zinc-700">&copy; {new Date().getFullYear()} GoViraleza. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="text-xs text-zinc-700 hover:text-zinc-400 transition-colors">Terms of Service</Link>
              <Link href="/privacy" className="text-xs text-zinc-700 hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Marquee Animation CSS ── */}
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
