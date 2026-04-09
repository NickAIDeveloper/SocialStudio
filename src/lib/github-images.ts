const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = 'NickAIDeveloper';
const REPO_NAME = 'GoViraleza';
const BRANCH = 'main';

interface UploadResult {
  url: string;
  path: string;
  sha: string;
}

export async function uploadImageToGitHub(
  imageBuffer: Buffer,
  fileName: string
): Promise<UploadResult> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required for image uploads');
  }

  const filePath = `images/${fileName}`;
  const content = imageBuffer.toString('base64');

  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `Upload ${fileName}`,
        content,
        branch: BRANCH,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub upload failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`;

  return {
    url: rawUrl,
    path: filePath,
    sha: data.content.sha,
  };
}

export async function deleteImageFromGitHub(filePath: string, sha: string): Promise<void> {
  if (!GITHUB_TOKEN) return;

  try {
    await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          message: `Cleanup ${filePath}`,
          sha,
          branch: BRANCH,
        }),
      }
    );
  } catch {
    // Cleanup is best-effort
  }
}
