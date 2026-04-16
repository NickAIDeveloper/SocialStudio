export const metadata = { title: 'Data Deletion | GoViraleza' };

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-bold text-white mb-2">Data Deletion Instructions</h1>
        <p className="text-sm text-zinc-500 mb-12">Last updated: April 16, 2026</p>

        <div className="prose prose-invert prose-sm prose-zinc max-w-none space-y-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_p]:leading-relaxed [&_ul]:space-y-2 [&_li]:text-zinc-400">

          <p>
            This page explains how to delete the data GoViraleza stores that was obtained through your Facebook / Meta connection, and how to delete your GoViraleza account entirely.
          </p>

          <h2>1. Disconnect Facebook from GoViraleza</h2>
          <p>
            To remove only the data we store through your Facebook / Instagram connection (your Meta access token, the cached list of ad accounts and Pages, and any cached ads insights), follow these steps:
          </p>
          <ul>
            <li>Log in to GoViraleza at <strong className="text-white">https://goviraleza.com</strong>.</li>
            <li>Open the <strong className="text-zinc-200">Meta</strong> page from the sidebar.</li>
            <li>Click <strong className="text-zinc-200">Disconnect</strong> on the connected-account card.</li>
            <li>Confirm the prompt.</li>
          </ul>
          <p>
            Within seconds of confirming, we permanently delete:
          </p>
          <ul>
            <li>Your encrypted long-lived Meta user access token</li>
            <li>The cached list of ad accounts, Pages, and Instagram business accounts</li>
            <li>All cached insights responses tied to your account</li>
            <li>Your selected ad account preference</li>
          </ul>

          <h2>2. Revoke GoViraleza&apos;s Access from Facebook</h2>
          <p>
            In addition to disconnecting on our side, you can revoke GoViraleza&apos;s access directly from your Facebook account:
          </p>
          <ul>
            <li>Go to <strong className="text-white">https://www.facebook.com/settings?tab=business_tools</strong>.</li>
            <li>Find <strong className="text-zinc-200">GoViraleza</strong> in the list.</li>
            <li>Click <strong className="text-zinc-200">Remove</strong>.</li>
          </ul>
          <p>
            This invalidates the access token Meta previously issued to us. We will no longer be able to read any data from your Facebook or Instagram accounts.
          </p>

          <h2>3. Delete Your Entire GoViraleza Account</h2>
          <p>
            If you want to delete your full GoViraleza account and all data associated with it (not just the Meta connection):
          </p>
          <ul>
            <li>Log in to GoViraleza.</li>
            <li>Go to <strong className="text-zinc-200">Settings</strong>.</li>
            <li>Click <strong className="text-zinc-200">Delete Account</strong> and confirm.</li>
          </ul>
          <p>
            We will permanently delete your account and all associated personal data within 30 days of the request, except where retention is required by law.
          </p>

          <h2>4. Request Deletion by Email</h2>
          <p>
            If you cannot log in, or if you would prefer to request deletion in writing, email us from the address associated with your account at:
          </p>
          <p>
            <strong className="text-white">privacy@goviraleza.com</strong>
          </p>
          <p>
            Include the subject line <em>&quot;Data Deletion Request&quot;</em> and we will respond within 7 days and complete deletion within 30 days.
          </p>

          <h2>5. What We Cannot Delete</h2>
          <p>
            A few categories of data cannot be deleted even upon request:
          </p>
          <ul>
            <li>Data required to be retained by law (e.g., tax records, anti-fraud logs)</li>
            <li>Anonymized, aggregated analytics that no longer identify you</li>
            <li>Backups, which are overwritten on a rolling 30-day schedule</li>
          </ul>

          <h2>6. Contact</h2>
          <p>
            For any data deletion question, contact <strong className="text-white">privacy@goviraleza.com</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
