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
} from 'lucide-react';

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

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Captions',
    description: 'Generate unique captions tailored to your brand voice, informed by competitor analysis and your best-performing content.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
  },
  {
    icon: Search,
    title: 'Competitor Discovery',
    description: 'AI finds your real competitors on Instagram and scrapes their profiles to learn what content works in your niche.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  {
    icon: Eye,
    title: 'Competitor Intelligence',
    description: 'See follower counts, posting frequency, top hashtags, and engagement rates. Know exactly what your competitors are doing.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  {
    icon: BarChart3,
    title: 'Visual Analytics',
    description: 'Health Score, timing heatmaps, content mix analysis, and hashtag performance. Your Instagram data as actionable insights.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    icon: Layers,
    title: 'Batch Content Creation',
    description: 'Generate 5, 10, 15, or 20 posts at once with AI captions, branded image overlays, and optimized hashtags.',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
  },
  {
    icon: MousePointerClick,
    title: 'One-Click Scheduling',
    description: 'Schedule directly to Buffer with branded overlays and smart timing. From idea to scheduled post in seconds.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
];

const steps = [
  {
    number: '01',
    icon: Globe,
    title: 'Connect Your Account',
    description: 'Add your Instagram handle and connect Buffer. We start analyzing your profile immediately.',
  },
  {
    number: '02',
    icon: Target,
    title: 'Discover Competitors',
    description: 'AI finds your top 10 competitors and scrapes their content strategy.',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Generate Content',
    description: 'AI creates captions informed by analytics and competitor data. Pick images. Add overlays.',
  },
  {
    number: '04',
    icon: Calendar,
    title: 'Schedule and Track',
    description: 'Schedule to Buffer and track performance with Health Score and AI insights.',
  },
];

const capabilities = [
  'AI caption generation',
  'Competitor scraping',
  'Visual analytics dashboard',
  'Batch post creation',
  'Brand voice customization',
  'Hook text overlays',
  'Content scheduling',
  'Hashtag optimization',
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[800px] w-[800px] rounded-full bg-teal-500/[0.06] blur-[150px]" />
        <div className="absolute right-0 top-[40%] h-[600px] w-[600px] rounded-full bg-purple-500/[0.04] blur-[120px]" />
        <div className="absolute left-0 bottom-0 h-[500px] w-[500px] rounded-full bg-pink-500/[0.03] blur-[100px]" />
      </div>

      {/* ── Sticky Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/40 bg-zinc-950/80 backdrop-blur-xl">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="GoViraleza home">
            <Logo />
            <span className="text-base font-bold tracking-tight">GoViraleza</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-zinc-400">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-white">How It Works</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal-400 shadow-lg shadow-teal-500/20"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 lg:pt-36">
        <div className="mx-auto max-w-4xl text-center">
          {/* Beta badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/5 px-4 py-2 text-xs font-medium text-teal-300 backdrop-blur-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
            Free during beta. No credit card required.
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
            Create content that{' '}
            <span className="bg-gradient-to-r from-teal-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              outperforms
            </span>{' '}
            your competition
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            GoViraleza combines AI content generation with competitor intelligence to help Instagram brands create smarter posts, faster.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-teal-500/25 transition-all hover:shadow-teal-500/40 hover:brightness-110"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/50 px-8 py-4 text-base font-semibold text-zinc-200 transition-all hover:border-zinc-600 hover:bg-zinc-800/50"
            >
              See Features
            </a>
          </div>

          {/* Capability pills */}
          <div className="mt-12 flex flex-wrap justify-center gap-2">
            {capabilities.map((cap) => (
              <span
                key={cap}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800/60 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-500"
              >
                <CheckCircle2 className="h-3 w-3 text-teal-500/60" />
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* Hero Image */}
        <div className="relative mt-16 mx-auto max-w-5xl">
          <div className="absolute -inset-6 rounded-3xl bg-gradient-to-r from-teal-500/15 via-purple-500/15 to-pink-500/15 blur-3xl" />
          <div className="relative overflow-hidden rounded-2xl border border-zinc-700/50 shadow-2xl shadow-black/50">
            <Image
              src="/hero-goviraleza.png"
              alt="GoViraleza platform"
              width={1200}
              height={600}
              className="w-full h-auto"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-sm font-medium text-zinc-300">
                AI-powered content creation for Instagram brands and creators
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats / Value Props ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { value: '5', label: 'Content Types', detail: 'Promo, Quote, Tips, Community, Carousel' },
            { value: '20', label: 'Posts Per Batch', detail: 'AI-generated with unique images' },
            { value: '10', label: 'Competitors Tracked', detail: 'Auto-discovered and analyzed' },
            { value: '30s', label: 'Idea to Scheduled', detail: 'One-click Buffer scheduling' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 text-center transition-colors hover:border-zinc-700/60"
            >
              <p className="text-3xl font-extrabold tracking-tight bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">
                {stat.value}
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-200">{stat.label}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{stat.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-28 sm:pb-36">
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-teal-400">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Everything you need to win on Instagram
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400">
            Real tools that analyze your market, generate content, and schedule posts. No fluff.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`group relative rounded-2xl border ${feature.border} bg-zinc-900/30 p-8 transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5`}
              >
                <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.bg} ${feature.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-3 text-lg font-bold text-zinc-100">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="relative z-10 mx-auto max-w-6xl px-6 pb-28 sm:pb-36">
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-teal-400">
            How It Works
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            From zero to scheduled in 4 steps
          </h2>
        </div>

        <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Connecting line */}
          <div className="pointer-events-none absolute top-16 left-[12.5%] right-[12.5%] hidden lg:block">
            <div className="h-px bg-gradient-to-r from-teal-500/40 via-purple-500/40 to-pink-500/40" />
          </div>

          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="relative text-center">
                <div className="relative z-10 mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700/60 bg-zinc-900 text-teal-400 shadow-lg shadow-black/30">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="mb-2 inline-block text-xs font-bold tracking-widest text-zinc-600 uppercase">
                  Step {step.number}
                </span>
                <h3 className="mb-2 text-base font-bold text-zinc-100">
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

      {/* ── What's Included ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28 sm:pb-36">
        <div className="rounded-3xl border border-zinc-800/60 bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 p-10 sm:p-16 backdrop-blur-sm">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              What powers GoViraleza
            </h2>
            <p className="mt-3 text-sm text-zinc-400">The technology behind your next viral post</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Brain, label: 'AI Engine', detail: 'LLM-powered caption generation with brand context and competitor insights' },
              { icon: Search, label: 'Image Intelligence', detail: 'AI picks the best stock image for each caption from Pixabay' },
              { icon: TrendingUp, label: 'Analytics Engine', detail: 'Health Score, timing analysis, hashtag performance, and content mix' },
              { icon: Zap, label: 'Scheduling', detail: 'Direct Buffer integration for one-click Instagram scheduling' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="text-center">
                  <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-base font-bold text-zinc-100">{item.label}</p>
                  <p className="mt-2 text-xs text-zinc-500 leading-relaxed">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32 sm:pb-40">
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800/60">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-zinc-900 to-purple-500/10" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/[0.08] blur-[100px]" />
          </div>

          <div className="relative px-8 py-20 text-center sm:px-16 sm:py-24">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-teal-400">
              Get Started
            </p>
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Ready to outperform your competition?
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base text-zinc-400">
              Join during beta and get full access for free. No credit card, no trial limits, no strings attached.
            </p>
            <Link
              href="/register"
              className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-10 py-4 text-base font-semibold text-white shadow-xl shadow-teal-500/25 transition-all hover:shadow-teal-500/40 hover:brightness-110"
            >
              Create Your Free Account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-5 text-xs text-zinc-600">
              Free forever during beta. Takes 2 minutes to set up.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-zinc-800/40">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
            {/* Brand */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <Logo />
                <span className="text-base font-bold tracking-tight">GoViraleza</span>
              </div>
              <p className="max-w-xs text-xs text-zinc-500 leading-relaxed">
                AI-powered Instagram content creation and competitor intelligence for brands and creators.
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-12">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Product</p>
                <div className="flex flex-col gap-2">
                  <a href="#features" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Features</a>
                  <a href="#how-it-works" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">How It Works</a>
                  <Link href="/register" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Get Started</Link>
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Account</p>
                <div className="flex flex-col gap-2">
                  <Link href="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Sign In</Link>
                  <Link href="/register" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Register</Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-zinc-800/40 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-zinc-600">
              &copy; {new Date().getFullYear()} GoViraleza. All rights reserved.
            </p>
            <p className="text-xs text-zinc-700">
              Built for Instagram creators who want to grow with data.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
