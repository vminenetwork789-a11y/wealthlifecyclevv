export type NodeOrigin = 'REGISTRATION' | 'BATCH' | 'CLONE' | 'AUTO_MAIN' | 'AUTO_EXTRA';

export type RewardType =
  | 'DIRECT'
  | 'LEVEL'
  | 'UPGRADE_VAULT'
  | 'VAULT_OVERFLOW'
  | 'ALLSELL'
  | 'BOT'
  | 'FAMILY_POOL_OVERFLOW';

export interface UserVault {
  id: string;
  owner: string;
  rank: number;
  balance: string;
  firstNodeId?: string;
  latestNodeId?: string;
  updatedAt: string;
}

export interface MatrixNodeItem {
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

export interface UserProfile {
  isRegistered: boolean;
  sponsor: string;
  sponsorMainNodeId: string;
  currentMaxRank: number;
  mainNodeIdRank1: string;
  latestCloneIdRank1: string;
  ownedMainIdsRank1?: string[];
  ownedCloneIdsRank1?: string[];
  ownedAllIdsRank1?: string[];
  note?: string;
  vaults?: UserVault[];
  nodes?: MatrixNodeItem[];
}

export interface RewardLog {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  recipient: string;
  rank: number;
  rewardType: RewardType | string;
  amount: string;
  txHash: string;
  createdAt?: string;
  timestamp?: string;
  blockNumber?: number;
}

export interface RankUpgradeLog {
  id: string;
  mainNodeId: string;
  owner: string;
  fromRank: number;
  toRank: number;
  newNodeId: string;
  parentId: string;
  side: 'LEFT' | 'RIGHT' | 'ROOT';
  directSponsor: string;
  directSponsorNodeId: string;
  rankPriceUsdt: string;
  vaultDeductedUsdt: string;
  walletPaidUsdt: string;
  upgradeMode: 'AUTO_VAULT' | 'HYBRID_VAULT_WALLET' | 'MANUAL_WALLET' | 'CLONE_IN_RANK' | 'ROOT_INIT';
  isClone?: boolean;
  isExtraId?: boolean;
  txHash: string;
  blockNumber?: number;
  createdAt: string;
}

export interface SimulationApplicant {
  owner: string;
  name?: string;
}

export interface SimulatedPlacement {
  applicantIndex: number;
  owner: string;
  assignedNodeId: string | number;
  targetParentId?: string;
  isLeft?: boolean;
  side?: 'LEFT' | 'RIGHT';
  sponsorAddress?: string;
  tierLevel?: number;
  positionName?: string;
  spilloverTriggered?: boolean;
  directSponsorReward?: string;
  matrixLevelReward?: string;
  vaultAccumulated?: string;
  directBonusUSDT?: string;
  levelBonusUSDT?: string;
  vaultAccumulatedUSDT?: string;
  origin?: NodeOrigin;
  cloneTrigger?: string;
}

export interface BatchSimulationResult {
  targetParentIds: string[];
  isLefts: boolean[];
  isClones: boolean[];
  simulationId?: string;
  sponsorAddress: string;
  rank?: number;
  targetRank?: number;
  pricePerNode?: string;
  totalApplicants: number;
  totalVolumeUSDT?: string;
  summary?: {
    totalDirectBonusDistributed: string;
    totalMatrixBonusDistributed: string;
    totalVaultLockedForAutoUpgrade: string;
    spilloversCount: number;
    clonesSpawned: number;
  };
  placements?: SimulatedPlacement[];
  networkFeeEstimateBNB?: string;
  recommendedAction?: string;
}

export interface AutoDeployResult {
  deployedContractAddress: string;
  txHash: string;
  network?: string;
  usdtTokenConfigured?: string;
  matrixMaxDepth?: number;
  tierBranchFactor?: number;
  maxCycleNodes?: number;
  timestamp?: string;
  status?: string;
  explorerUrl?: string;
  message?: string;
  logs?: string;
}

export interface PositionReservation {
  ticketId: string;
  owner: string;
  rank: number;
  sponsorNodeId: number;
  sponsorAddress: string;
  targetParentId: string;
  isLeft: boolean;
  activeRound: number;
  assignedNodeId: string;
  batchCount: number;
  batchDetails: Array<{
    applicantIndex: number;
    owner: string;
    targetParentId: string;
    isLeft: boolean;
    assignedNodeId: string;
    isClone?: boolean;
  }>;
  status: 'RESERVED' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  reservedAt: number;
  expiresAt: number;
  txHash?: string;
}

export interface QueueStatusData {
  engine: string;
  isRedisConnected: boolean;
  waitingJobsCount: number;
  activeJobsCount: number;
  completedJobsCount: number;
  failedJobsCount: number;
  activeReservationsCount: number;
  activeReservations: PositionReservation[];
  recentHistory: PositionReservation[];
}
