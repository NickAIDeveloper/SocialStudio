import { ResearchSection } from '@/components/research/research-section';

export default function ResearchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-(--txt)">
          Audience research <span aria-hidden>🔎</span>
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          What your audience actually complains about, mined from real community discussions and
          ranked by how many people say it. Findings feed straight into caption and ad copy, so posts
          are written in their words rather than yours.
        </p>
      </div>
      <ResearchSection />
    </div>
  );
}
