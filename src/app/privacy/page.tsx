export const metadata = { title: 'Privacy Policy | GoViraleza' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-500 mb-12">Last updated: April 10, 2026</p>

        <div className="prose prose-invert prose-sm prose-zinc max-w-none space-y-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_p]:leading-relaxed [&_ul]:space-y-2 [&_li]:text-zinc-400">

          <p>
            This Privacy Policy describes how GoViraleza (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, stores, and protects your personal information when you use our Service. By using the Service, you consent to the data practices described in this policy.
          </p>

          <h2>1. Information We Collect</h2>

          <h3>1.1 Account Information</h3>
          <p>When you create an account, we collect:</p>
          <ul>
            <li>Your name</li>
            <li>Email address</li>
            <li>Password (stored as a bcrypt hash, never in plain text)</li>
          </ul>

          <h3>1.2 Brand and Business Information</h3>
          <p>When you configure brands in the Service, we collect:</p>
          <ul>
            <li>Brand name and slug</li>
            <li>Instagram handle</li>
            <li>Website URL (optional)</li>
            <li>Brand description (optional)</li>
            <li>Brand colors and logo</li>
            <li>Brand voice preferences (tone, style, do&apos;s and don&apos;ts)</li>
          </ul>

          <h3>1.3 Third-Party API Keys</h3>
          <p>
            When you connect third-party services (Buffer, Pixabay, Gemini, etc.), we store your API keys encrypted using AES-256 encryption. We never store API keys in plain text. These keys are used solely to make API calls on your behalf.
          </p>

          <h3>1.4 Instagram Data</h3>
          <p>We collect publicly available Instagram data including:</p>
          <ul>
            <li>Public profile information (follower count, following count, post count, bio)</li>
            <li>Public post data (captions, likes, comments, timestamps)</li>
            <li>Public hashtag usage</li>
          </ul>
          <p>
            This data is collected from publicly accessible Instagram pages and is used solely for analytics and competitor intelligence features within the Service.
          </p>

          <h3>1.5 Generated Content</h3>
          <p>We store content you create through the Service, including:</p>
          <ul>
            <li>AI-generated captions, hooks, and hashtags</li>
            <li>Processed images with overlays</li>
            <li>Draft and scheduled posts</li>
          </ul>

          <h3>1.6 Usage Data</h3>
          <p>We may collect anonymous usage data including pages visited, features used, and error logs for the purpose of improving the Service.</p>

          <h2>2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide and maintain the Service</li>
            <li>Generate AI-powered content tailored to your brands</li>
            <li>Perform competitor analysis on your behalf</li>
            <li>Schedule posts through connected services (e.g., Buffer)</li>
            <li>Calculate analytics and insights for your accounts</li>
            <li>Communicate with you about the Service (e.g., security alerts, updates)</li>
            <li>Improve and develop new features</li>
            <li>Comply with legal obligations</li>
          </ul>

          <h2>3. Data Sharing and Third Parties</h2>
          <p>
            <strong className="text-white">We do not sell, rent, or trade your personal information to third parties.</strong>
          </p>
          <p>Your data may be shared with third-party services only as necessary to provide the Service:</p>
          <ul>
            <li><strong className="text-zinc-200">Cerebras AI:</strong> Your brand information and content context are sent to generate captions. We do not send personal information.</li>
            <li><strong className="text-zinc-200">Buffer:</strong> Post content and scheduling information are sent when you schedule posts.</li>
            <li><strong className="text-zinc-200">Pixabay / Image Providers:</strong> Search queries are sent to find images. No personal data is shared.</li>
            <li><strong className="text-zinc-200">Google Gemini:</strong> Image generation prompts are sent when using AI image generation. No personal data is shared.</li>
            <li><strong className="text-zinc-200">Instagram:</strong> We access publicly available data. We do not use your Instagram login credentials.</li>
            <li><strong className="text-zinc-200">Neon (Database):</strong> Your data is stored in a PostgreSQL database hosted by Neon. Data is encrypted in transit.</li>
            <li><strong className="text-zinc-200">Vercel (Hosting):</strong> The Service is hosted on Vercel. Vercel may collect server logs and performance data.</li>
          </ul>

          <h2>4. Data Security</h2>
          <p>We implement reasonable security measures to protect your data:</p>
          <ul>
            <li>Passwords are hashed using bcrypt with salt rounds</li>
            <li>API keys are encrypted using AES-256 before storage</li>
            <li>All data transmission uses HTTPS/TLS encryption</li>
            <li>Database access is restricted and authenticated</li>
            <li>Sessions use JWT tokens with secure, HTTP-only cookies</li>
          </ul>
          <p>
            <strong className="text-white">However, no method of transmission or storage is 100% secure. We cannot guarantee absolute security of your data. You acknowledge and accept this inherent risk.</strong>
          </p>

          <h2>5. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law or for legitimate business purposes (e.g., resolving disputes, enforcing agreements).
          </p>
          <p>
            Scraped Instagram data (public post data and profile stats) may be retained in aggregate, anonymized form for analytics purposes after account deletion.
          </p>

          <h2>6. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li><strong className="text-zinc-200">Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong className="text-zinc-200">Rectification:</strong> Request correction of inaccurate data</li>
            <li><strong className="text-zinc-200">Deletion:</strong> Request deletion of your personal data</li>
            <li><strong className="text-zinc-200">Portability:</strong> Request your data in a structured, machine-readable format</li>
            <li><strong className="text-zinc-200">Objection:</strong> Object to certain processing of your data</li>
            <li><strong className="text-zinc-200">Withdrawal of Consent:</strong> Withdraw consent at any time where processing is based on consent</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at <strong className="text-white">privacy@goviraleza.com</strong>.
          </p>

          <h2>7. Cookies and Tracking</h2>
          <p>
            We use essential cookies for authentication and session management. We do not use third-party advertising cookies or tracking pixels. We may use anonymous analytics to understand Service usage patterns.
          </p>

          <h2>8. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child under 18, we will delete it promptly.
          </p>

          <h2>9. International Data Transfers</h2>
          <p>
            Your data may be transferred to and processed in countries other than your country of residence, including the United States and Australia. By using the Service, you consent to such transfers. We ensure appropriate safeguards are in place for international data transfers.
          </p>

          <h2>10. GDPR Compliance (European Users)</h2>
          <p>If you are located in the European Economic Area (EEA), the following applies:</p>
          <ul>
            <li>Our legal basis for processing is your consent (account creation) and legitimate interest (service provision)</li>
            <li>You have the right to lodge a complaint with your local data protection authority</li>
            <li>We process data in accordance with GDPR principles of data minimization and purpose limitation</li>
          </ul>

          <h2>11. CCPA Compliance (California Users)</h2>
          <p>If you are a California resident:</p>
          <ul>
            <li>You have the right to know what personal information we collect and how it is used</li>
            <li>You have the right to request deletion of your personal information</li>
            <li>We do not sell personal information</li>
            <li>We will not discriminate against you for exercising your privacy rights</li>
          </ul>

          <h2>12. Australian Privacy Act Compliance</h2>
          <p>
            We comply with the Australian Privacy Principles (APPs) under the Privacy Act 1988 (Cth). We collect personal information only for purposes directly related to providing the Service. You may access and correct your personal information by contacting us.
          </p>

          <h2>13. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Your continued use of the Service after changes constitutes acceptance of the updated policy. We encourage you to review this policy periodically.
          </p>

          <h2>14. Data Breach Notification</h2>
          <p>
            In the event of a data breach that may affect your personal information, we will notify affected users within 72 hours of becoming aware of the breach, as required by applicable law. Notification will be sent to the email address associated with your account.
          </p>

          <h2>15. Contact</h2>
          <p>
            For privacy-related inquiries, contact us at: <strong className="text-white">privacy@goviraleza.com</strong>
          </p>
          <p>
            For general inquiries: <strong className="text-white">support@goviraleza.com</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
