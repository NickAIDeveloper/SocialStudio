import { auth } from '@/auth';

export async function getRequiredSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function getUserId(): Promise<string> {
  const session = await getRequiredSession();
  return session.user!.id!;
}
