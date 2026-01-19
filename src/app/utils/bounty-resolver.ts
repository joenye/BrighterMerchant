import { getBountyKeyByName } from '../../algorithm/bounties';

export function resolveBountyKeyFromName(bountyName: string): string {
  return getBountyKeyByName(bountyName) as unknown as string;
}
