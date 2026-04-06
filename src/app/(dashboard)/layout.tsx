import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <main className="ml-60 min-h-screen transition-all duration-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">{children}</div>
      </main>
    </>
  );
}
