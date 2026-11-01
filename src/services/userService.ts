export type NodeOrigin = 'REGISTRATION' | 'BATCH' | 'CLONE' | 'AUTO_MAIN' | 'AUTO_EXTRA';
export type RewardType =
  | 'DIRECT'
  | 'DIRECT_ROOT_FEE'
  | 'LEVEL'
  | 'UPGRADE_VAULT'
  | 'VAULT_OVERFLOW'
  | 'ALLSELL'
  | 'BOT'
  | 'FAMILY_POOL_OVERFLOW';

export const RANK_PRICES_USDT: number[] = [
  5, 10, 20, 30, 40, 50, 60, 70, 80, 90,
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
  2000, 3000, 4000, 5000, 6000, 8000, 10000,
];

export interface UserAccountModel {
  id: string;
  owner: string;
  sponsor: string | null;
  sponsorMainNodeId: string | null;
  currentMaxRank: number;
  createdAt: string;
  updatedAt: string;
  vaults: UserVaultModel[];
}

export interface UserVaultModel {
  id: string;
  owner: string;
  rank: number;
  balance: string;
  updatedAt: string;
}

export interface MatrixNodeModel {
  id: string;
  rank: number;
  owner: string;
  sponsor: string;
  parentId: string;
  leftChild: string;
  rightChild: string;
  isClone: boolean;
  isExtraId: boolean;
  origin: NodeOrigin;
  createdAt: string;
}

export interface RewardLogModel {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  recipient: string;
  rank: number;
  rewardType: RewardType;
  amount: string;
  txHash: string;
  createdAt: string;
}

// In-Memory Database Store matching Prisma schema & FractalFlowMatrix27.sol
export const inMemoryDB = {
  users: new Map<string, UserAccountModel>([
    [
      '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D'.toLowerCase(),
      {
        id: 'user-root',
        owner: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
        sponsor: null,
        sponsorMainNodeId: '0',
        currentMaxRank: 27,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        updatedAt: new Date().toISOString(),
        vaults: Array.from({ length: 27 }, (_, i) => ({
          id: `v-root-${i + 1}`,
          owner: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
          rank: i + 1,
          balance: i < 5 ? (RANK_PRICES_USDT[i] * 0.7).toFixed(2) : '0.00',
          updatedAt: new Date().toISOString(),
        })),
      },
    ],
  ]),
  nodes: new Map<string, MatrixNodeModel>([
    [
      '1',
      {
        id: '1',
        rank: 1,
        owner: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
        sponsor: '0x0000000000000000000000000000000000000000',
        parentId: '0',
        leftChild: '2',
        rightChild: '3',
        isClone: false,
        isExtraId: false,
        origin: 'REGISTRATION',
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      },
    ],
    [
      '2',
      {
        id: '2',
        rank: 1,
        owner: '0x43a8B6f88B6A08B0bFEF3B48F7d3A1A5c862E001',
        sponsor: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
        parentId: '1',
        leftChild: '4',
        rightChild: '0',
        isClone: false,
        isExtraId: false,
        origin: 'REGISTRATION',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
    ],
    [
      '3',
      {
        id: '3',
        rank: 1,
        owner: '0x88f29C95882B49f485B8101438aD23C471372E77',
        sponsor: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
        parentId: '1',
        leftChild: '0',
        rightChild: '0',
        isClone: false,
        isExtraId: false,
        origin: 'REGISTRATION',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ],
    [
      '4',
      {
        id: '4',
        rank: 1,
        owner: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
        sponsor: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
        parentId: '2',
        leftChild: '0',
        rightChild: '0',
        isClone: true,
        isExtraId: false,
        origin: 'CLONE',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
  ]),
  rewardLogs: [] as RewardLogModel[],
};

// Seed initial reward logs matching FractalFlowMatrix27.sol (Rank 1 = 5 USDT: 30% Direct = 1.50, 2% Level = 0.10, 35% Vault = 1.75, 4% AllSell = 0.20, 1% Bot = 0.05)
inMemoryDB.rewardLogs = [
  {
    id: 'log-1',
    fromNodeId: '2',
    toNodeId: '1',
    recipient: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
    rank: 1,
    rewardType: 'DIRECT',
    amount: '1.500000',
    txHash: '0x8f2a93c129e4710bcf7730e7192a550d53c7a2d3b4e5f6a7b8c9d0e1f2a3b4c5',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'log-2',
    fromNodeId: '2',
    toNodeId: '1',
    recipient: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
    rank: 1,
    rewardType: 'LEVEL',
    amount: '0.100000',
    txHash: '0x3c19b4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
    createdAt: new Date(Date.now() - 3600000 * 2.5).toISOString(),
  },
  {
    id: 'log-3',
    fromNodeId: '2',
    toNodeId: '1',
    recipient: '0x7Ab09d1a90CA26a0E0eBF06758de668C848D700D',
    rank: 1,
    rewardType: 'UPGRADE_VAULT',
    amount: '1.750000',
    txHash: '0x99e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
    createdAt: new Date(Date.now() - 3600000 * 1.1).toISOString(),
  },
  {
    id: 'log-4',
    fromNodeId: '2',
    toNodeId: '0',
    recipient: '0x88f29C95882B49f485B8101438aD23C471372E77',
    rank: 1,
    rewardType: 'ALLSELL',
    amount: '1.600000',
    txHash: '0x11a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
];

export async function registerUserAccount(owner: string, sponsor?: string, sponsorMainNodeId?: string | number) {
  try {
    const key = owner.toLowerCase();
    const existing = inMemoryDB.users.get(key);
    if (existing) return existing;

    const newUser: UserAccountModel = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      owner,
      sponsor: sponsor || null,
      sponsorMainNodeId: sponsorMainNodeId ? sponsorMainNodeId.toString() : '1',
      currentMaxRank: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      vaults: Array.from({ length: 27 }, (_, i) => ({
        id: `v-${owner}-${i + 1}`,
        owner,
        rank: i + 1,
        balance: '0.00',
        updatedAt: new Date().toISOString(),
      })),
    };

    inMemoryDB.users.set(key, newUser);
    return newUser;
  } catch (error) {
    console.error('Error registering user account:', error);
    throw error;
  }
}

export async function createMatrixNodeData(params: {
  nodeId: string | number;
  rank: number;
  owner: string;
  sponsor?: string;
  parentId: string | number;
  isLeft?: boolean;
  isClone?: boolean;
  isExtraId?: boolean;
  origin?: NodeOrigin;
}) {
  try {
    const { nodeId, rank, owner, sponsor, parentId, isLeft, isClone, isExtraId, origin } = params;
    const strNodeId = nodeId.toString();
    const strParentId = parentId.toString();

    const newNode: MatrixNodeModel = {
      id: strNodeId,
      rank: Number(rank),
      owner,
      sponsor: sponsor || owner,
      parentId: strParentId,
      leftChild: '0',
      rightChild: '0',
      isClone: Boolean(isClone),
      isExtraId: Boolean(isExtraId),
      origin: origin || 'REGISTRATION',
      createdAt: new Date().toISOString(),
    };

    inMemoryDB.nodes.set(strNodeId, newNode);

    const parentNode = inMemoryDB.nodes.get(strParentId);
    if (parentNode) {
      if (isLeft !== undefined) {
        if (isLeft) parentNode.leftChild = strNodeId;
        else parentNode.rightChild = strNodeId;
      } else {
        if (parentNode.leftChild === '0' || !parentNode.leftChild) {
          parentNode.leftChild = strNodeId;
        } else if (parentNode.rightChild === '0' || !parentNode.rightChild) {
          parentNode.rightChild = strNodeId;
        }
      }
    }

    return newNode;
  } catch (error) {
    console.error('Error creating matrix node:', error);
    throw error;
  }
}

export async function getUserProfileWithVaults(owner: string) {
  try {
    const key = owner.toLowerCase();
    let user = inMemoryDB.users.get(key);

    if (!user) {
      user = await registerUserAccount(owner, undefined, 1);
    }

    const nodes = Array.from(inMemoryDB.nodes.values())
      .filter((n) => n.owner.toLowerCase() === key)
      .sort((a, b) => Number(a.id) - Number(b.id));

    return {
      ...user,
      nodes,
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

export async function recordRewardLog(data: {
  fromNodeId: string;
  toNodeId: string;
  recipient: string;
  rank: number;
  rewardType: RewardType;
  amount: string;
  txHash: string;
}) {
  const newLog: RewardLogModel = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    fromNodeId: data.fromNodeId,
    toNodeId: data.toNodeId,
    recipient: data.recipient,
    rank: data.rank,
    rewardType: data.rewardType,
    amount: data.amount,
    txHash: data.txHash,
    createdAt: new Date().toISOString(),
  };

  inMemoryDB.rewardLogs.unshift(newLog);
  if (inMemoryDB.rewardLogs.length > 300) {
    inMemoryDB.rewardLogs.pop();
  }
  return newLog;
}
