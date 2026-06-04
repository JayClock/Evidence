import { ServerError, User, Users, Workspace } from '../domain';

export async function findUser(users: Users, userId: string): Promise<User> {
  const user = await users.findByIdentity(userId);
  if (!user) {
    throw ServerError.notFound(`user ${userId} not found`);
  }
  return user;
}

export async function findWorkspace(
  users: Users,
  userId: string,
  workspaceId: string,
): Promise<Workspace> {
  const user = await findUser(users, userId);
  const workspace = await user.workspaces().findByIdentity(workspaceId);
  if (!workspace) {
    throw ServerError.notFound(`workspace ${workspaceId} not found`);
  }
  return workspace;
}
