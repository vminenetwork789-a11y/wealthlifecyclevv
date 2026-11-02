import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESS,
  BSC_TESTNET_RPC,
  BSC_TESTNET_PARAMS,
  MATRIX_ABI,
  RANK_PRICES_USDT,
} from '../contracts/config';
import { calculateMainIdVaultPools } from '../utils/vaultPools';
import {
  RefreshCw,
  Search,
  Copy,
  Check,
  Sparkles,
  RotateCcw,
  User,
  ZoomIn,
  ZoomOut,
  Dna,
  Layers,
  Eye,
  Coins,
  ChevronDown,
  ChevronUp,
  X,
  Maximize2,
  Shield,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export interface EnrichedBinaryNode {
  id: number;
  rank: number;
  level: number;
  parentId: number;
  isLeft: boolean;
  owner: string;
  directSponsor: string;
  leftChild: number;
  rightChild: number;
  isClone: boolean;
  isExtraId: boolean;
  isAutoMainId: boolean;
  // Clone & Lineage Metadata
  originMainId: number; // รหัสหลัก (Primary Main ID of this owner/lineage, e.g. #1, #2, #7)
  spawnedFromNodeId: number; // Exact node whose Right child triggered this clone
  cloneRound: number; // รอบโคลน (รอบ 1, 2, 3...)
  subCloneDepth: number; // #0 if spawned from primary ID, >=1 if spawned from a clone
  spawnedCloneIds: Array<{ cloneNodeId: number; round: number }>; // Clones spawned by this node
  directUplineNodeId: number; // ผู้แนะนำ (Sponsor's primary node ID, #0 for Root)
  // Per-Node Benefits (ผลประโยชน์เฉพาะผังนี้)
  directRewardThisNode: number; // 30% ค่าแนะนำเฉพาะผังนี้
  unilevelRewardThisNode: number; // ยูนิเลเวล 15 ชั้นเฉพาะผังนี้ (2% ต่อชั้น)
  // Cumulative Benefits Across All Nodes of this Owner/ID (ผลประโยชน์สะสมรวมทุกผัง)
  directRewardAllNodes: number; // 30% ค่าแนะนำ (ทุกผัง)
  unilevelRewardAllNodes: number; // ยูนิเลเวล 15 ชั้น (ทุกผัง)
  upgradeRankPool: number; // Upgrade Rank Pool
  newAutoIdPool: number; // New Auto ID Pool (Vault 1-4)
  newExtraIdPool: number; // New Extra ID Pool (Vault 5-27)
  totalClonesCount: number; // จำนวนโคลนนิ่งทั้งหมด
  totalAutoIdCount: number; // จำนวน New Auto ID ทั้งหมด
  totalExtraIdCount: number; // จำนวน New Extra ID ทั้งหมด
  vaultBalance: number;
  nextRankPrice: number;
  familyPoolDirectFromLineage?: number; // 30% จากโคลน #1 ลงซ้ายที่ถูกส่งเข้า Family Pool
  grossVaultFromLineage?: number; // ยอดสะสม Vault รวมก่อนหักออก Auto ID / อัปเกรด
  grossVault1To4FromLineage?: number; // ยอดสะสม Vault รวมทั้ง R1-R4 ก่อนหักออก Auto ID
  thisRankRemainingVault?: number; // ยอดคงเหลือจริงใน nodeUpgradeVault ของ Rank ปัจจุบัน
  vault1To4BreakdownText?: string; // รายละเอียดการสะสมและหัก Auto ID ข้าม Rank 1-3
  vault4To27BreakdownText?: string; // รายละเอียดการสะสมและหัก Extra ID ข้าม Rank 4-27
  targetMainIdCurrentRank?: number; // สถานะ rank ปัจจุบันของ idหลักนั้น
  window5Start?: number; // Rank เริ่มต้นของ 5 rank ย้อนหลัง
  window5End?: number; // Rank สิ้นสุดของ 5 rank ย้อนหลัง
  window5DescriptionTh?: string; // ข้อความอธิบายช่วง 5 rank ย้อนหลัง
  r1MainId?: number; // รหัสหลักต้นสังกัดใน Rank 1 (เฉพาะโหนดที่มาจาก Rank 1 เท่านั้น)
  isExtraLineage?: boolean; // เป็นรหัสหลักอิสระประเภท Extra ID (หรือโคลนที่เกิดจาก Extra ID) ใน Rank 2..27
  extraMainLabel?: string; // ชื่อรหัสหลักอิสระของ Extra ID เช่น "Extra R2-#3" (ไม่ซ้ำกับ Main # ใน Rank 1)
}

interface ConnectorLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isLeft: boolean;
  isFilled: boolean;
}

interface MatrixTreeVisualizerProps {
  language: 'th' | 'en';
  userAddress: string | null;
  chainId?: number | null;
  isBscTestnet?: boolean;
  usdtBalance?: string;
  allowance?: string;
  onConnectWallet?: () => void;
  onSwitchNetwork?: () => void;
  onApproveUsdt?: (amountUsdt?: number) => Promise<any>;
  onRegisterWithSponsor?: (
    sponsorNodeId: number,
    autoOptions?: { targetParentId?: number | string; isLeft?: boolean }
  ) => Promise<any>;
  onUpgradeToRank?: (targetRank: number, targetMainId?: number | string) => Promise<any>;
  onOpenRegisterModal?: () => void;
  lastTxSuccess?: string | null;
  refreshTrigger?: any;
  contractAddress?: string;
  currentUserRank?: number;
}

const RPC_ENDPOINTS = [
  BSC_TESTNET_RPC,
  ...BSC_TESTNET_PARAMS.rpcUrls.filter((u) => u !== BSC_TESTNET_RPC),
];

function shortenWallet(addr?: string): string {
  if (!addr || addr === ethers.ZeroAddress) return '0x0000...';
  return `${addr.slice(0, 6)}...`;
}

// Build preview dataset matching all screenshots (including #1..#10 with #7 (7) and Clone #7 #10 #0 รอบ 1)
function buildScreenshotPreviewNodes(rank: number): Map<number, EnrichedBinaryNode> {
  const unitPrice = RANK_PRICES_USDT[rank - 1] || 5;
  const nextPrice = rank < 27 ? RANK_PRICES_USDT[rank] : unitPrice * 2;
  const scale = unitPrice / 5;

  const rawList: EnrichedBinaryNode[] = [
    {
      id: 1,
      rank,
      level: 1,
      parentId: 0,
      isLeft: true,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: ethers.ZeroAddress,
      leftChild: 2,
      rightChild: 3,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 1,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [{ cloneNodeId: 4, round: 1 }],
      directUplineNodeId: 0,
      directRewardThisNode: 3.0 * scale,
      unilevelRewardThisNode: 0.6 * scale,
      directRewardAllNodes: 6.0 * scale,
      unilevelRewardAllNodes: 0.7 * scale,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 2,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 2,
      rank,
      level: 2,
      parentId: 1,
      isLeft: true,
      owner: '0xd350758257Bee9AdB111944b1737d257620e80CE',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 4,
      rightChild: 5,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 2,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [{ cloneNodeId: 6, round: 1 }],
      directUplineNodeId: 1,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.3 * scale,
      directRewardAllNodes: 1.5 * scale,
      unilevelRewardAllNodes: 0.4 * scale,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 1,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 3,
      rank,
      level: 2,
      parentId: 1,
      isLeft: false,
      owner: '0xd350758257Bee9AdB111944b1737d257620e80CE',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 10,
      rightChild: 13,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 3,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 1,
      directRewardThisNode: 1.5 * scale,
      unilevelRewardThisNode: 0.2 * scale,
      directRewardAllNodes: 1.5 * scale,
      unilevelRewardAllNodes: 0.2 * scale,
      upgradeRankPool: 1.75 * scale,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 0,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 1.75 * scale,
      nextRankPrice: nextPrice,
    },
    {
      id: 4,
      rank,
      level: 3,
      parentId: 2,
      isLeft: true,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 6,
      rightChild: 0,
      isClone: true,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 1,
      spawnedFromNodeId: 1,
      cloneRound: 1,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 0,
      directRewardThisNode: 1.5 * scale,
      unilevelRewardThisNode: 0.1 * scale,
      directRewardAllNodes: 6.0 * scale,
      unilevelRewardAllNodes: 0.7 * scale,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 2,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 5,
      rank,
      level: 3,
      parentId: 2,
      isLeft: false,
      owner: '0xd350758257Bee9AdB111944b1737d257620e80CE',
      directSponsor: '0xd350758257Bee9AdB111944b1737d257620e80CE',
      leftChild: 0,
      rightChild: 0,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 5,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 2,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 0.0,
      unilevelRewardAllNodes: 0.0,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 0,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 6,
      rank,
      level: 4,
      parentId: 4,
      isLeft: true,
      owner: '0xd350758257Bee9AdB111944b1737d257620e80CE',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 0,
      rightChild: 0,
      isClone: true,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 2,
      spawnedFromNodeId: 2,
      cloneRound: 1,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 1,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 1.5 * scale,
      unilevelRewardAllNodes: 0.4 * scale,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 1,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 7,
      rank,
      level: 3,
      parentId: 3,
      isLeft: true,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0xd350758257Bee9AdB111944b1737d257620e80CE',
      leftChild: 8,
      rightChild: 9,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 7,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [{ cloneNodeId: 10, round: 1 }],
      directUplineNodeId: 3,
      directRewardThisNode: 1.5 * scale,
      unilevelRewardThisNode: 0.1 * scale,
      directRewardAllNodes: 1.5 * scale,
      unilevelRewardAllNodes: 0.1 * scale,
      upgradeRankPool: 1.75 * scale,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 1,
      totalAutoIdCount: 1,
      totalExtraIdCount: 0,
      vaultBalance: 1.75 * scale,
      nextRankPrice: nextPrice,
    },
    {
      id: 8,
      rank,
      level: 4,
      parentId: 7,
      isLeft: true,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 0,
      rightChild: 0,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 8,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 7,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 0.0,
      unilevelRewardAllNodes: 0.0,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 0,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 9,
      rank,
      level: 4,
      parentId: 7,
      isLeft: false,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 0,
      rightChild: 0,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 9,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 7,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 0.0,
      unilevelRewardAllNodes: 0.0,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 0,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 10,
      rank,
      level: 3,
      parentId: 3,
      isLeft: true,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0xd350758257Bee9AdB111944b1737d257620e80CE',
      leftChild: 11,
      rightChild: 12,
      isClone: true,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 1,
      spawnedFromNodeId: 7,
      cloneRound: 1,
      subCloneDepth: 2,
      spawnedCloneIds: [],
      directUplineNodeId: 3,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 1.5 * scale,
      unilevelRewardAllNodes: 0.1 * scale,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 1,
      totalAutoIdCount: 1,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 11,
      rank,
      level: 4,
      parentId: 10,
      isLeft: true,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 0,
      rightChild: 0,
      isClone: false,
      isExtraId: false,
      isAutoMainId: true,
      originMainId: 11,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 10,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 0.0,
      unilevelRewardAllNodes: 0.0,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 0,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 12,
      rank,
      level: 4,
      parentId: 10,
      isLeft: false,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 0,
      rightChild: 0,
      isClone: false,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 12,
      spawnedFromNodeId: 0,
      cloneRound: 0,
      subCloneDepth: 0,
      spawnedCloneIds: [],
      directUplineNodeId: 10,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 0.0,
      unilevelRewardAllNodes: 0.0,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 0,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
    {
      id: 13,
      rank,
      level: 3,
      parentId: 3,
      isLeft: false,
      owner: '0x5b0791A0bc71900238de668C848D700D',
      directSponsor: '0x5b0791A0bc71900238de668C848D700D',
      leftChild: 0,
      rightChild: 0,
      isClone: true,
      isExtraId: false,
      isAutoMainId: false,
      originMainId: 1,
      spawnedFromNodeId: 10,
      cloneRound: 2,
      subCloneDepth: 3,
      spawnedCloneIds: [],
      directUplineNodeId: 3,
      directRewardThisNode: 0.0,
      unilevelRewardThisNode: 0.0,
      directRewardAllNodes: 0.0,
      unilevelRewardAllNodes: 0.0,
      upgradeRankPool: 0.0,
      newAutoIdPool: 0.0,
      newExtraIdPool: 0.0,
      totalClonesCount: 0,
      totalAutoIdCount: 0,
      totalExtraIdCount: 0,
      vaultBalance: 0.0,
      nextRankPrice: nextPrice,
    },
  ];

  const map = new Map<number, EnrichedBinaryNode>();
  for (const item of rawList) {
    map.set(item.id, item);
  }
  return map;
}

export const MatrixTreeVisualizer: React.FC<MatrixTreeVisualizerProps> = ({
  language,
  userAddress,
  isBscTestnet = false,
  usdtBalance = '0.00',
  allowance = '0.00',
  onApproveUsdt,
  onRegisterWithSponsor,
  onUpgradeToRank,
  onOpenRegisterModal,
  lastTxSuccess,
  refreshTrigger,
  contractAddress,
  currentUserRank = 1,
}) => {
  const [selectedRank, setSelectedRank] = useState<number>(1);
  const [rankNodeCounts, setRankNodeCounts] = useState<Record<number, number>>({});
  const [focusRootId, setFocusRootId] = useState<number>(1);
  const [navigationHistory, setNavigationHistory] = useState<number[]>([1]);
  const [searchInput, setSearchInput] = useState<string>('1');
  const [zoomScale, setZoomScale] = useState<number>(0.55);
  const [viewMode, setViewMode] = useState<'onchain' | 'demoCloneTree'>('onchain');
  const [justUpdatedBadge, setJustUpdatedBadge] = useState<boolean>(false);
  // 0 = Auto (แสดงครบทุกชั้นที่มีข้อมูลต่อลงมาโดยอัตโนมัติ)
  const [maxRenderDepth, setMaxRenderDepth] = useState<number>(0);

  // Real-Time Auto Sync State (Default: 5 seconds for near-instant automatic tree extension)
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(true);
  const [realtimeInterval, setRealtimeInterval] = useState<number>(5); // 5 seconds
  const [realtimeCountdown, setRealtimeCountdown] = useState<number>(5);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);

  // Track newly arrived nodes to highlight & auto-extend in the Binary Tree
  const knownNodeIdsByRankRef = useRef<Map<number, Set<number>>>(new Map());
  const [newlyAddedNodeIds, setNewlyAddedNodeIds] = useState<Set<number>>(new Set());
  const [autoFollowNewNodes, setAutoFollowNewNodes] = useState<boolean>(true);
  const [latestNewNodeAlert, setLatestNewNodeAlert] = useState<{
    id: number;
    originMainId: number;
    parentId: number;
    isLeft: boolean;
    level: number;
    isClone: boolean;
    addedCount: number;
    timestamp: string;
  } | null>(null);

  // Registration Popup Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [regSponsorId, setRegSponsorId] = useState<number>(1);
  const [regTargetParentId, setRegTargetParentId] = useState<number | string | undefined>(undefined);
  const [regIsLeft, setRegIsLeft] = useState<boolean | undefined>(undefined);
  const [regNodeCount, setRegNodeCount] = useState<number>(1);
  const [regIsApproving, setRegIsApproving] = useState<boolean>(false);
  const [regIsSubmitting, setRegIsSubmitting] = useState<boolean>(false);
  const [regTxMessage, setRegTxMessage] = useState<string | null>(null);
  const [regTxError, setRegTxError] = useState<string | null>(null);

  const openRegisterModal = (sponsorId: number, parentId?: number | string, isLeft?: boolean) => {
    setRegSponsorId(sponsorId || 1);
    setRegTargetParentId(parentId);
    setRegIsLeft(isLeft);
    setRegNodeCount(1);
    setRegTxError(null);
    setRegTxMessage(null);
    setIsRegisterModalOpen(true);
  };

  const handleModalApproveUsdt = async () => {
    if (!onApproveUsdt) return;
    setRegIsApproving(true);
    setRegTxError(null);
    try {
      await onApproveUsdt(regNodeCount * 5);
      setRegTxMessage(language === 'th' ? 'อนุมัติ USDT สำเร็จเรียบร้อย!' : 'USDT Approved successfully!');
    } catch (err: any) {
      setRegTxError(err?.message || 'Approve failed');
    } finally {
      setRegIsApproving(false);
    }
  };

  const handleModalSubmitRegister = async () => {
    if (!onRegisterWithSponsor) return;
    setRegIsSubmitting(true);
    setRegTxError(null);
    setRegTxMessage(
      language === 'th'
        ? 'กำลังส่งคำสั่งลงทะเบียนไปยังบล็อกเชน...'
        : 'Submitting registration to blockchain...'
    );
    try {
      await onRegisterWithSponsor(regSponsorId, {
        targetParentId: regTargetParentId,
        isLeft: regIsLeft,
      });
      setRegTxMessage(
        language === 'th' ? 'สมัครสมาชิกสำเร็จเรียบร้อยแล้ว!' : 'Registration successful!'
      );
      setTimeout(() => {
        setIsRegisterModalOpen(false);
      }, 1600);
    } catch (err: any) {
      setRegTxError(err?.message || 'Registration failed');
    } finally {
      setRegIsSubmitting(false);
    }
  };

  // Track which Node ID currently has its "รายละเอียดผลประโยชน์" (Benefit Details) popup modal open
  const [expandedBenefitNodeId, setExpandedBenefitNodeId] = useState<number | null>(null);
  const [benefitModalTab, setBenefitModalTab] = useState<
    'all' | 'direct30' | 'level30' | 'vault35' | 'auto_extra'
  >('all');
  const [perIdReportsMap, setPerIdReportsMap] = useState<Map<number, any>>(new Map());
  const [modalUpgradeTargetRank, setModalUpgradeTargetRank] = useState<number>(2);
  const [isModalUpgrading, setIsModalUpgrading] = useState<boolean>(false);
  const [modalUpgradeMessage, setModalUpgradeMessage] = useState<string | null>(null);
  const [modalUpgradeError, setModalUpgradeError] = useState<string | null>(null);

  const fetchPerIdHistoryForModal = useCallback(async () => {
    try {
      const res = await fetch('/api/matrix/per-id-history');
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.reports)) {
          const map = new Map<number, any>();
          for (const rep of data.reports) {
            map.set(Number(rep.id), rep);
          }
          setPerIdReportsMap(map);
        }
      }
    } catch {
      // Ignore error
    }
  }, []);

  useEffect(() => {
    fetchPerIdHistoryForModal();
  }, [fetchPerIdHistoryForModal, selectedRank, refreshTrigger, lastTxSuccess]);

  const [isLoadingTree, setIsLoadingTree] = useState<boolean>(false);
  const [totalNodesInRank, setTotalNodesInRank] = useState<number>(1);
  const [onChainNodesMap, setOnChainNodesMap] = useState<Map<number, EnrichedBinaryNode>>(new Map());
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeLocks, setActiveLocks] = useState<
    Array<{ parentId: string; isLeft: boolean; owner: string }>
  >([]);

  useEffect(() => {
    const fetchLocks = async () => {
      try {
        const res = await fetch('/api/queue/status');
        if (res.ok) {
          const data = await res.json();
          if (data.activeReservations && Array.isArray(data.activeReservations)) {
            const now = Date.now();
            const locks: Array<{ parentId: string; isLeft: boolean; owner: string }> = [];
            for (const r of data.activeReservations) {
              if (r.status === 'RESERVED' && now <= r.expiresAt && r.rank === selectedRank) {
                for (const b of r.batchDetails) {
                  locks.push({
                    parentId: String(b.targetParentId),
                    isLeft: Boolean(b.isLeft),
                    owner: b.owner,
                  });
                }
              }
            }
            setActiveLocks(locks);
          }
        }
      } catch {
        // Ignore fetch error
      }
    };

    fetchLocks();
    const interval = setInterval(fetchLocks, 3000);
    return () => clearInterval(interval);
  }, [selectedRank]);

  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const treeContentRef = useRef<HTMLDivElement | null>(null);
  const [connectorLines, setConnectorLines] = useState<ConnectorLine[]>([]);
  const [isCloneStatusPopupOpen, setIsCloneStatusPopupOpen] = useState<boolean>(false);

  const getWorkingProvider = useCallback(async (): Promise<ethers.Provider> => {
    if (typeof window !== 'undefined' && window.ethereum && isBscTestnet) {
      try {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        await browserProvider.getBlockNumber();
        return browserProvider;
      } catch {
        // Fallback to RPC
      }
    }

    for (const rpcUrl of RPC_ENDPOINTS) {
      try {
        const rpcProvider = new ethers.JsonRpcProvider(
          rpcUrl,
          { chainId: 97, name: 'bnbt' },
          { staticNetwork: true, polling: true, pollingInterval: 15000, batchMaxCount: 1 }
        );
        rpcProvider.on('error', () => {});
        await rpcProvider.getBlockNumber();
        return rpcProvider;
      } catch {
        continue;
      }
    }

    const fallbackProvider = new ethers.JsonRpcProvider(
      BSC_TESTNET_RPC,
      { chainId: 97, name: 'bnbt' },
      { staticNetwork: true, polling: true, pollingInterval: 15000, batchMaxCount: 1 }
    );
    fallbackProvider.on('error', () => {});
    return fallbackProvider;
  }, [isBscTestnet]);

  // Load all nodes in the selected rank from Smart Contract / Database & compute Clone Lineage + Benefit Breakdown
  const loadOnChainTree = useCallback(
    async (
      targetRankParam?: number,
      options?: { silent?: boolean; forceSync?: boolean }
    ) => {
      const activeRank = targetRankParam !== undefined ? targetRankParam : selectedRank;
      const isSilent = Boolean(options?.silent);
      const forceSync = Boolean(options?.forceSync);

      if (!isSilent) {
        setIsLoadingTree(true);
      } else {
        setIsLiveSyncing(true);
      }

      try {
        const activeContract = contractAddress || CONTRACT_ADDRESS;
        let lazyContract: ethers.Contract | null = null;
        const getFallbackContract = async (): Promise<ethers.Contract> => {
          if (!lazyContract) {
            const provider = await getWorkingProvider();
            lazyContract = new ethers.Contract(activeContract, MATRIX_ABI, provider);
          }
          return lazyContract;
        };

        const unitPrice = RANK_PRICES_USDT[activeRank - 1] || 5;
        const nextPrice = activeRank < 27 ? RANK_PRICES_USDT[activeRank] : unitPrice * 2;
        const directBonusUnit = unitPrice * 0.3; // 30%
        const unilevelBonusUnit = unitPrice * 0.02; // 2% per level (15 levels)
        const vaultUnit = unitPrice * 0.35; // 35%

        let totalNodes = 1;
        let loadedFromApi = false;

        const rawNodes = new Map<
          number,
          {
            id: number;
            owner: string;
            directSponsor: string;
            parentId: number;
            leftChild: number;
            rightChild: number;
            isClone: boolean;
            isExtraId: boolean;
          }
        >();
        const onChainOriginMap = new Map<number, number>();
        const onChainNodeVaultMap = new Map<number, number>();
        const onChainSponsorNodeMap = new Map<number, number>();
        const onChainCloneRoundMap = new Map<number, number>();

        let fetchedRankCounts: Record<number, number> = {};

        // 1. First attempt: High-speed Database + incremental chain sync endpoint & rank counts in parallel
        try {
          const [res, countsRes] = await Promise.all([
            fetch(
              `/api/matrix/tree-nodes?rank=${activeRank}&contract=${activeContract}${
                forceSync ? '&forceSync=1' : ''
              }`
            ),
            fetch(
              `/api/matrix/rank-counts?contract=${activeContract}${forceSync ? '&forceSync=1' : ''}`
            ).catch(() => null),
          ]);

          if (countsRes && countsRes.ok) {
            const countsData = await countsRes.json().catch(() => null);
            if (countsData?.success && countsData.counts) {
              fetchedRankCounts = countsData.counts;
              setRankNodeCounts((prev) => ({ ...prev, ...countsData.counts }));
            }
          }

          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.nodes) && data.nodes.length > 0) {
              totalNodes = Number(data.totalNodes || data.nodes.length);
              setTotalNodesInRank(totalNodes);
              fetchedRankCounts[activeRank] = totalNodes;
              setRankNodeCounts((prev) => ({ ...prev, [activeRank]: totalNodes }));
              for (const item of data.nodes) {
                const nid = Number(item.id);
                if (nid > 0) {
                  rawNodes.set(nid, {
                    id: nid,
                    owner: String(item.owner || ethers.ZeroAddress),
                    directSponsor: String(item.directSponsor || ethers.ZeroAddress),
                    parentId: Number(item.parentId || 0),
                    leftChild: Number(item.leftChild || 0),
                    rightChild: Number(item.rightChild || 0),
                    isClone: Boolean(item.isClone),
                    isExtraId: Boolean(item.isExtraId) && !Boolean(item.isClone),
                  });
                  if (Number(item.originMainId) > 0) {
                    onChainOriginMap.set(nid, Number(item.originMainId));
                  }
                  if (Number(item.directSponsorNodeId) > 0) {
                    onChainSponsorNodeMap.set(nid, Number(item.directSponsorNodeId));
                  }
                  if (Number(item.cloneRound) > 0) {
                    onChainCloneRoundMap.set(nid, Number(item.cloneRound));
                  }
                  onChainNodeVaultMap.set(nid, Number(item.nodeVault || 0));
                }
              }
              loadedFromApi = true;
            }
          }
        } catch {
          // Fallback to RPC below
        }

        // 2. Fallback: Chunked direct RPC calls (only used if backend Database API is unreachable)
        if (!loadedFromApi) {
          const contract = await getFallbackContract();
          try {
            const totalBn: bigint = await contract.totalNodesInRank(activeRank);
            totalNodes = Number(totalBn);
          } catch {
            totalNodes = 1;
          }
          setTotalNodesInRank(totalNodes);

          try {
            const countsResults = await Promise.all(
              Array.from({ length: 27 }, (_, i) =>
                contract
                  .totalNodesInRank(i + 1)
                  .then((v: bigint) => Number(v))
                  .catch(() => 0)
              )
            );
            const countsMap: Record<number, number> = {};
            countsResults.forEach((c, idx) => {
              countsMap[idx + 1] = c;
            });
            countsMap[activeRank] = totalNodes;
            fetchedRankCounts = countsMap;
            setRankNodeCounts((prev) => ({ ...prev, ...countsMap }));
          } catch {
            // Ignore count fallback error
          }

          const maxFetch = Math.min(Math.max(totalNodes, 1), 300);
          const idsToFetch = Array.from({ length: maxFetch }, (_, idx) => idx + 1);
          const CHUNK_SIZE = 6;

          for (let i = 0; i < idsToFetch.length; i += CHUNK_SIZE) {
            const chunk = idsToFetch.slice(i, i + CHUNK_SIZE);
            await Promise.all(
              chunk.map(async (nodeId) => {
                try {
                  const [raw, origBn, vaultBn, sponsorNodeBn, cloneRoundBn] = await Promise.all([
                    contract.rankNodes(activeRank, nodeId),
                    contract.nodeOriginMainId(activeRank, nodeId).catch(() => 0n),
                    contract.nodeUpgradeVault(activeRank, nodeId).catch(() => 0n),
                    contract.nodeDirectSponsorNodeId(activeRank, nodeId).catch(() => 0n),
                    contract.nodeCloneRound(activeRank, nodeId).catch(() => 0n),
                  ]);
                  const fetchedId = Number(raw.id ?? raw[0] ?? 0);
                  if (fetchedId > 0) {
                    rawNodes.set(fetchedId, {
                      id: fetchedId,
                      owner: String(raw.owner ?? raw[1] ?? ethers.ZeroAddress),
                      directSponsor: String(raw.directSponsor ?? raw[2] ?? ethers.ZeroAddress),
                      parentId: Number(raw.parentId ?? raw[3] ?? 0),
                      leftChild: Number(raw.leftChild ?? raw[4] ?? 0),
                      rightChild: Number(raw.rightChild ?? raw[5] ?? 0),
                      isClone: Boolean(raw.isClone ?? raw[6] ?? false),
                      isExtraId: Boolean(raw.isExtraId ?? raw[7] ?? false),
                    });
                    if (Number(origBn) > 0) {
                      onChainOriginMap.set(fetchedId, Number(origBn));
                    }
                    if (Number(sponsorNodeBn) > 0) {
                      onChainSponsorNodeMap.set(fetchedId, Number(sponsorNodeBn));
                    }
                    if (Number(cloneRoundBn) > 0) {
                      onChainCloneRoundMap.set(fetchedId, Number(cloneRoundBn));
                    }
                    const dec = vaultBn >= 100000000000000n ? 18 : 6;
                    onChainNodeVaultMap.set(fetchedId, Number(ethers.formatUnits(vaultBn, dec)));
                  }
                } catch {
                  // Ignore individual slot read error
                }
              })
            );
          }
        }

        // Guarantee Root Node #1 is always present for Ranks 1..27
        if (!rawNodes.has(1)) {
          let fallbackRootOwner = '0x622E20082e63c7220c5AF0A77Cbc437a98505311';
          if (!loadedFromApi) {
            try {
              const contract = await getFallbackContract();
              const r1Root = await contract.rankNodes(1, 1);
              const r1Owner = String(r1Root.owner ?? r1Root[1] ?? '');
              if (r1Owner && r1Owner !== ethers.ZeroAddress) {
                fallbackRootOwner = r1Owner;
              }
            } catch {
              // Use default root owner
            }
          }
          rawNodes.set(1, {
            id: 1,
            owner: fallbackRootOwner,
            directSponsor: ethers.ZeroAddress,
            parentId: 0,
            leftChild: 0,
            rightChild: 0,
            isClone: false,
            isExtraId: false,
          });
        }

        // Self-healing Parent-Child Linker: ensure every newly added node (e.g. #6, #7...) is attached to its parent's leftChild or rightChild
        const rawSortedIds = Array.from(rawNodes.keys()).sort((a, b) => a - b);
        for (const cid of rawSortedIds) {
          if (cid <= 1) continue;
          const childObj = rawNodes.get(cid);
          if (!childObj || childObj.parentId <= 0) continue;
          const parentObj = rawNodes.get(childObj.parentId);
          if (!parentObj) continue;
          if (parentObj.leftChild === cid || parentObj.rightChild === cid) continue;
          if (!parentObj.leftChild || parentObj.leftChild <= 0 || !rawNodes.has(parentObj.leftChild)) {
            parentObj.leftChild = cid;
          } else if (
            !parentObj.rightChild ||
            parentObj.rightChild <= 0 ||
            !rawNodes.has(parentObj.rightChild)
          ) {
            parentObj.rightChild = cid;
          }
        }

      // Fetch cross-rank snapshots for Ranks 1..7 (for Vault pools R1-3 & R4-27), all populated ranks (count > 1), and activeRank / activeRank + 1
      const ranksToSnapshot = new Set<number>([1, 2, 3, 4, 5, 6, 7]);
      ranksToSnapshot.add(activeRank);
      if (activeRank < 27) {
        ranksToSnapshot.add(activeRank + 1);
      }
      Object.entries({ ...rankNodeCounts, ...fetchedRankCounts }).forEach(([rKey, countVal]) => {
        const rNum = Number(rKey);
        if (rNum >= 1 && rNum <= 27 && Number(countVal) > 1) {
          ranksToSnapshot.add(rNum);
        }
      });

      interface RankNodeSnapshot {
        id: number;
        owner: string;
        directSponsor: string;
        parentId: number;
        leftChild: number;
        rightChild: number;
        isClone: boolean;
        isExtraId: boolean;
        originMainId: number;
        directSponsorNodeId: number;
        nodeVault: number;
      }

      const multiRankSnapshots = new Map<number, Map<number, RankNodeSnapshot>>();
      await Promise.all(
        Array.from(ranksToSnapshot).map(async (r) => {
          if (r === activeRank) {
            const selfSnap = new Map<number, RankNodeSnapshot>();
            for (const [id, n] of rawNodes.entries()) {
              selfSnap.set(id, {
                ...n,
                isExtraId: Boolean(n.isExtraId) && !Boolean(n.isClone),
                originMainId: onChainOriginMap.get(id) || id,
                directSponsorNodeId: onChainSponsorNodeMap.get(id) || 0,
                nodeVault: onChainNodeVaultMap.get(id) ?? 0,
              });
            }
            multiRankSnapshots.set(r, selfSnap);
            return;
          }
          const rMap = new Map<number, RankNodeSnapshot>();
          let rLoadedFromApi = false;
          try {
            const res = await fetch(`/api/matrix/tree-nodes?rank=${r}&contract=${activeContract}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && Array.isArray(data.nodes) && data.nodes.length > 0) {
                for (const item of data.nodes) {
                  const nid = Number(item.id);
                  if (nid > 0) {
                    rMap.set(nid, {
                      id: nid,
                      owner: String(item.owner || ethers.ZeroAddress),
                      directSponsor: String(item.directSponsor || ethers.ZeroAddress),
                      parentId: Number(item.parentId || 0),
                      leftChild: Number(item.leftChild || 0),
                      rightChild: Number(item.rightChild || 0),
                      isClone: Boolean(item.isClone),
                      isExtraId: Boolean(item.isExtraId) && !Boolean(item.isClone),
                      originMainId: Number(item.originMainId) > 0 ? Number(item.originMainId) : nid,
                      directSponsorNodeId: Number(item.directSponsorNodeId || 0),
                      nodeVault: Number(item.nodeVault ?? 0),
                    });
                  }
                }
                rLoadedFromApi = true;
              }
            }
          } catch {
            // Fallback to RPC below
          }

          if (!rLoadedFromApi) {
            try {
              const contract = await getFallbackContract();
              const totalInR = Math.min(Number(await contract.totalNodesInRank(r)), 60);
              const rIds = Array.from({ length: Math.max(totalInR, 1) }, (_, idx) => idx + 1);
              const CHUNK_SIZE = 8;
              for (let i = 0; i < rIds.length; i += CHUNK_SIZE) {
                const chunk = rIds.slice(i, i + CHUNK_SIZE);
                await Promise.all(
                  chunk.map(async (nid) => {
                    try {
                      const [raw, origBn, vaultBn, sponsorNodeBn] = await Promise.all([
                        contract.rankNodes(r, nid),
                        contract.nodeOriginMainId(r, nid).catch(() => 0n),
                        contract.nodeUpgradeVault(r, nid).catch(() => 0n),
                        contract.nodeDirectSponsorNodeId(r, nid).catch(() => 0n),
                      ]);
                      const fid = Number(raw.id ?? raw[0] ?? 0);
                      if (fid > 0) {
                        rMap.set(fid, {
                          id: fid,
                          owner: String(raw.owner ?? raw[1] ?? ethers.ZeroAddress),
                          directSponsor: String(raw.directSponsor ?? raw[2] ?? ethers.ZeroAddress),
                          parentId: Number(raw.parentId ?? raw[3] ?? 0),
                          leftChild: Number(raw.leftChild ?? raw[4] ?? 0),
                          rightChild: Number(raw.rightChild ?? raw[5] ?? 0),
                          isClone: Boolean(raw.isClone ?? raw[6] ?? false),
                          isExtraId: Boolean(raw.isExtraId ?? raw[7] ?? false),
                          originMainId: Number(origBn) > 0 ? Number(origBn) : fid,
                          directSponsorNodeId: Number(sponsorNodeBn || 0n),
                          nodeVault: Number(ethers.formatUnits(vaultBn, vaultBn >= 100000000000000n ? 18 : 6)),
                        });
                      }
                    } catch {
                      // Ignore
                    }
                  })
                );
              }
            } catch {
              // Ignore
            }
          }
          multiRankSnapshots.set(r, rMap);
        })
      );

      // สำหรับการวางตำแหน่ง Rank 2-27:
      // ตรวจสอบว่าผู้แนะนำตรง (Direct Sponsor ID เช่น ID #5) มีโหนดอยู่ใน Rank นั้นหรือยัง
      // หากผู้แนะนำยังไม่ได้อัปเกรดขึ้นมาถึง Rank นั้น ให้หาตำแหน่งว่างชั้นตื้นลงมาจากซ้ายไปขวา (BFS จาก Root #1)
      const snapR1ForPlacement = multiRankSnapshots.get(1);
      for (const [rNum, sMap] of multiRankSnapshots.entries()) {
        if (rNum <= 1 || sMap.size <= 1) continue;
        const sIds = Array.from(sMap.keys()).sort((a, b) => a - b);

        for (const nid of sIds) {
          if (nid <= 1) continue;
          const node = sMap.get(nid)!;
          if (node.isClone || node.isExtraId) continue;

          let spMainId = node.directSponsorNodeId || 0;
          if (spMainId <= 0 && node.originMainId > 1 && snapR1ForPlacement) {
            const origR1 = snapR1ForPlacement.get(node.originMainId);
            if (origR1 && origR1.directSponsorNodeId > 0) {
              spMainId = origR1.directSponsorNodeId;
            }
          }
          if (spMainId <= 1) continue;

          const sponsorExistsBefore = sIds.some((prevId) => {
            if (prevId >= nid) return false;
            const prev = sMap.get(prevId);
            if (!prev || prev.isClone || prev.isExtraId) return false;
            return spMainId === 1 ? prev.id === 1 : prev.originMainId === spMainId;
          });

          if (!sponsorExistsBefore) {
            const curParent = sMap.get(node.parentId);
            if (curParent && !curParent.isClone) continue;
            const q: number[] = [1];
            const vis = new Set<number>();
            let shallowParentId = 1;
            let shallowIsLeft = true;

            while (q.length > 0) {
              const curId = q.shift()!;
              if (vis.has(curId)) continue;
              vis.add(curId);
              const cur = sMap.get(curId);
              if (!cur || cur.id >= nid) continue;

              const hasLeftBefore =
                cur.leftChild > 0 &&
                cur.leftChild < nid &&
                sMap.has(cur.leftChild) &&
                sMap.get(cur.leftChild)!.parentId === cur.id;
              if (!hasLeftBefore) {
                shallowParentId = cur.id;
                shallowIsLeft = true;
                break;
              }

              const hasRightBefore =
                cur.rightChild > 0 &&
                cur.rightChild < nid &&
                sMap.has(cur.rightChild) &&
                sMap.get(cur.rightChild)!.parentId === cur.id;
              if (!hasRightBefore) {
                shallowParentId = cur.id;
                shallowIsLeft = false;
                break;
              }

              q.push(cur.leftChild, cur.rightChild);
            }

            const shallowParent = sMap.get(shallowParentId);
            if (shallowParent && node.parentId !== shallowParentId) {
              const oldParent = sMap.get(node.parentId);
              if (oldParent) {
                if (oldParent.leftChild === nid) oldParent.leftChild = 0;
                if (oldParent.rightChild === nid) oldParent.rightChild = 0;
              }
              node.parentId = shallowParentId;
              if (shallowIsLeft) {
                shallowParent.leftChild = nid;
              } else {
                shallowParent.rightChild = nid;
              }

              if (rNum === activeRank) {
                const rawChild = rawNodes.get(nid);
                const rawOldParent = oldParent ? rawNodes.get(oldParent.id) : undefined;
                const rawNewParent = rawNodes.get(shallowParentId);
                if (rawOldParent) {
                  if (rawOldParent.leftChild === nid) rawOldParent.leftChild = 0;
                  if (rawOldParent.rightChild === nid) rawOldParent.rightChild = 0;
                }
                if (rawChild && rawNewParent) {
                  rawChild.parentId = shallowParentId;
                  if (shallowIsLeft) rawNewParent.leftChild = nid;
                  else rawNewParent.rightChild = nid;
                }
              }
            }
          }
        }

        // สำหรับการวางตำแหน่ง Auto Extra ID ใน Rank 2-27:
        // จะต้องไปต่อติดผู้แนะนำ Direct Sponsor เท่านั้น ถ้าไอดีผู้แนะนำ Direct Sponsor เต็ม ก็ไปหาไอดีโคลนนิ่งของผู้แนะนำ Direct Sponsor เท่านั้น
        const removedFalseCloneIds = new Set<number>();
        for (const nid of sIds) {
          if (nid <= 1 || removedFalseCloneIds.has(nid)) continue;
          const node = sMap.get(nid);
          if (!node || !node.isExtraId) continue;

          const spMainId = node.directSponsorNodeId > 0 ? node.directSponsorNodeId : 1;
          let spNodeInRank: RankNodeSnapshot | undefined;
          for (const prevId of sIds) {
            if (prevId >= nid || removedFalseCloneIds.has(prevId)) continue;
            const prev = sMap.get(prevId);
            if (!prev || prev.isClone || prev.isExtraId) continue;
            if (spMainId === 1 ? prev.id === 1 : prev.originMainId === spMainId) {
              spNodeInRank = prev;
              break;
            }
          }
          if (!spNodeInRank) continue;

          const spOrigTag = spNodeInRank.originMainId || spNodeInRank.id;
          const curParent = sMap.get(node.parentId);
          const isAlreadyUnderSpOrSpClone =
            curParent &&
            (curParent.id === spNodeInRank.id ||
              (curParent.isClone &&
                ((curParent.originMainId || curParent.id) === spNodeInRank.id ||
                  (curParent.originMainId || curParent.id) === spOrigTag)));

          if (!isAlreadyUnderSpOrSpClone) {
            let targetParentId = 0;
            let targetIsLeft = true;

            const spHasLeftBefore =
              spNodeInRank.leftChild > 0 &&
              spNodeInRank.leftChild < nid &&
              sMap.has(spNodeInRank.leftChild);
            const spHasRightBefore =
              spNodeInRank.rightChild > 0 &&
              spNodeInRank.rightChild < nid &&
              sMap.has(spNodeInRank.rightChild);

            if (!spHasLeftBefore) {
              targetParentId = spNodeInRank.id;
              targetIsLeft = true;
            } else if (!spHasRightBefore) {
              targetParentId = spNodeInRank.id;
              targetIsLeft = false;
            } else {
              for (const candId of sIds) {
                if (candId >= nid || removedFalseCloneIds.has(candId)) continue;
                const cand = sMap.get(candId);
                if (!cand || !cand.isClone) continue;
                const cOrig = cand.originMainId || cand.id;
                if (cOrig !== spNodeInRank.id && cOrig !== spOrigTag) continue;

                const cHasLeftBefore =
                  cand.leftChild > 0 && cand.leftChild < nid && sMap.has(cand.leftChild);
                if (!cHasLeftBefore) {
                  targetParentId = cand.id;
                  targetIsLeft = true;
                  break;
                }
                const cHasRightBefore =
                  cand.rightChild > 0 && cand.rightChild < nid && sMap.has(cand.rightChild);
                if (!cHasRightBefore) {
                  targetParentId = cand.id;
                  targetIsLeft = false;
                  break;
                }
              }
            }

            const targetParent = targetParentId > 0 ? sMap.get(targetParentId) : undefined;
            if (targetParent && node.parentId !== targetParent.id) {
              const oldParent = sMap.get(node.parentId);
              if (oldParent) {
                if (oldParent.leftChild === nid) oldParent.leftChild = 0;
                if (oldParent.rightChild === nid) oldParent.rightChild = 0;
              }

              const displacedId = targetIsLeft ? targetParent.leftChild : targetParent.rightChild;
              if (displacedId > 0 && displacedId !== nid && sMap.has(displacedId)) {
                const displacedNode = sMap.get(displacedId)!;
                const oldOrig = oldParent ? oldParent.originMainId || oldParent.id : 0;
                const dispOrig = displacedNode.originMainId || displacedNode.id;
                const hasChildren = Array.from(sMap.values()).some(
                  (c) =>
                    c.id !== displacedNode.id &&
                    !removedFalseCloneIds.has(c.id) &&
                    c.parentId === displacedNode.id
                );

                if (
                  displacedNode.isClone &&
                  oldOrig > 0 &&
                  dispOrig === oldOrig &&
                  (!oldParent?.rightChild || oldParent.rightChild === 0) &&
                  !hasChildren
                ) {
                  removedFalseCloneIds.add(displacedNode.id);
                  sMap.delete(displacedNode.id);
                  if (rNum === activeRank) {
                    rawNodes.delete(displacedNode.id);
                  }
                } else if (!targetParent.rightChild || !sMap.has(targetParent.rightChild)) {
                  targetParent.rightChild = displacedNode.id;
                  displacedNode.parentId = targetParent.id;
                  if (rNum === activeRank) {
                    const rawDisp = rawNodes.get(displacedNode.id);
                    const rawTarg = rawNodes.get(targetParent.id);
                    if (rawDisp && rawTarg) {
                      rawDisp.parentId = targetParent.id;
                      rawTarg.rightChild = displacedNode.id;
                    }
                  }
                }
              }

              node.parentId = targetParent.id;
              if (targetIsLeft) {
                targetParent.leftChild = nid;
              } else {
                targetParent.rightChild = nid;
              }

              if (rNum === activeRank) {
                const rawChild = rawNodes.get(nid);
                const rawOldParent = oldParent ? rawNodes.get(oldParent.id) : undefined;
                const rawNewParent = rawNodes.get(targetParent.id);
                if (rawOldParent) {
                  if (rawOldParent.leftChild === nid) rawOldParent.leftChild = 0;
                  if (rawOldParent.rightChild === nid) rawOldParent.rightChild = 0;
                }
                if (rawChild && rawNewParent) {
                  rawChild.parentId = targetParent.id;
                  if (targetIsLeft) rawNewParent.leftChild = nid;
                  else rawNewParent.rightChild = nid;
                }
              }
            }
          }
        }

        for (const cid of sIds) {
          if (removedFalseCloneIds.has(cid)) continue;
          const c = sMap.get(cid);
          if (!c || !c.isClone) continue;
          const origId = c.originMainId || c.id;
          const hasAnyRightTrigger = Array.from(sMap.values()).some(
            (m) =>
              !removedFalseCloneIds.has(m.id) &&
              (m.id === origId || (m.isClone && (m.originMainId || m.id) === origId)) &&
              m.rightChild > 0 &&
              sMap.has(m.rightChild)
          );
          const hasChildren = Array.from(sMap.values()).some(
            (ch) =>
              ch.id !== c.id &&
              !removedFalseCloneIds.has(ch.id) &&
              ch.parentId === c.id
          );
          if (!hasAnyRightTrigger && !hasChildren) {
            removedFalseCloneIds.add(c.id);
            sMap.delete(c.id);
            if (rNum === activeRank) {
              rawNodes.delete(c.id);
            }
            const p = sMap.get(c.parentId);
            if (p) {
              if (p.leftChild === c.id) {
                if (p.rightChild > 0 && sMap.has(p.rightChild)) {
                  p.leftChild = p.rightChild;
                  p.rightChild = 0;
                } else {
                  p.leftChild = 0;
                }
              } else if (p.rightChild === c.id) {
                p.rightChild = 0;
              }
              if (rNum === activeRank) {
                const rawP = rawNodes.get(p.id);
                if (rawP) {
                  rawP.leftChild = p.leftChild;
                  rawP.rightChild = p.rightChild;
                }
              }
            }
          }
        }

        // Cap nodeVault by actual leftChild count in Rank rNum so moved leftChild doesn't leave phantom vault
        const rUnitVault = Number(((RANK_PRICES_USDT[rNum - 1] || 10) * 0.35).toFixed(4));
        for (const m of sMap.values()) {
          if (m.isClone || m.isExtraId) continue;
          let leftCount = 0;
          const mOrig = m.originMainId || m.id;
          for (const cand of sMap.values()) {
            const cOrig = cand.originMainId || cand.id;
            if (
              (cand.id === m.id || (cand.isClone && (cOrig === m.id || cOrig === mOrig))) &&
              cand.leftChild > 0 &&
              sMap.has(cand.leftChild)
            ) {
              leftCount++;
            }
          }
          const maxPossible = Number((leftCount * rUnitVault).toFixed(4));
          if ((m.nodeVault || 0) > maxPossible) {
            m.nodeVault = maxPossible;
            if (rNum === activeRank) {
              onChainNodeVaultMap.set(m.id, maxPossible);
            }
          }
        }
      }

      // Ensure Pool 3 (Vault R4-27) -> Auto Extra IDs in Rank 2..27 are reconciled even when RPC fallback is used
      let hasOnChainExtraNodes = false;
      for (const [rNum, sMap] of multiRankSnapshots.entries()) {
        if (rNum >= 2 && Array.from(sMap.values()).some((sn) => sn.isExtraId && !sn.isClone)) {
          hasOnChainExtraNodes = true;
          break;
        }
      }
      const snapR1Init = multiRankSnapshots.get(1);
      if (!hasOnChainExtraNodes && snapR1Init && snapR1Init.size > 0) {
        const initMainsByRank = new Map<number, Map<string, number[]>>();
        for (const [rNum, sMap] of multiRankSnapshots.entries()) {
          const mMap = new Map<string, number[]>();
          const sIds = Array.from(sMap.keys()).sort((a, b) => a - b);
          for (const sid of sIds) {
            const sn = sMap.get(sid)!;
            if (!sn.isClone && !sn.isExtraId) {
              const ok = sn.owner.toLowerCase();
              const arr = mMap.get(ok) || [];
              arr.push(sn.id);
              mMap.set(ok, arr);
            }
          }
          initMainsByRank.set(rNum, mMap);
        }

        const getCorrespInit = (r1Id: number, _ownerAddr: string, targetR: number): number => {
          if (targetR === 1) return r1Id;
          if (r1Id === 1) return 1;
          const targetSnapMap = multiRankSnapshots.get(targetR);
          if (!targetSnapMap) return 0;
          const matched = Array.from(targetSnapMap.values()).find(
            (sn) => !sn.isClone && !sn.isExtraId && sn.originMainId === r1Id
          );
          return matched ? matched.id : 0;
        };

        const r1SortedIds = Array.from(snapR1Init.keys()).sort((a, b) => a - b);
        for (const r1Id of r1SortedIds) {
          const r1Node = snapR1Init.get(r1Id)!;
          if (r1Node.isClone || r1Node.isExtraId) continue;

          let curRank = r1Id === 1 ? 27 : 1;
          if (r1Id !== 1) {
            for (let r = 27; r >= 1; r--) {
              const cid = getCorrespInit(r1Id, r1Node.owner, r);
              if (cid > 0 && multiRankSnapshots.get(r)?.has(cid)) {
                curRank = r;
                break;
              }
            }
          }
          const win5Start = Math.max(1, curRank - 4);
          const eligibleSnaps: Array<{ rank: number; snapNode: RankNodeSnapshot }> = [];
          for (let r = 4; r <= 27; r++) {
            if (curRank === 27 || r < win5Start) {
              const cid = getCorrespInit(r1Id, r1Node.owner, r);
              const sn = cid > 0 ? multiRankSnapshots.get(r)?.get(cid) : undefined;
              if (sn) eligibleSnaps.push({ rank: r, snapNode: sn });
            }
          }
          if (eligibleSnaps.length === 0) continue;

          // เงื่อนไข Auto Extra ID: นำยอด New Extra ID Pool มาลูปหาราคาแต่ละ Rank จาก Rank 27 ลงมาถึง Rank 2
          const minR2Price = RANK_PRICES_USDT[1] || 10;
          let spawnedExtraInPass = true;
          let guard = 0;
          while (spawnedExtraInPass && guard < 50) {
            spawnedExtraInPass = false;
            guard++;

            for (let targetR = 27; targetR >= 2; targetR--) {
              const availPool = eligibleSnaps.reduce((s, item) => s + Number(item.snapNode.nodeVault || 0), 0);
              if (availPool + 1e-6 < minR2Price) break;

              const tPrice = RANK_PRICES_USDT[targetR - 1] || 10;
              if (availPool + 1e-6 < tPrice) continue;

              const correspTargetId = getCorrespInit(r1Id, r1Node.owner, targetR);
              const targetSnapMap = multiRankSnapshots.get(targetR);
              const targetMainSnap = correspTargetId > 0 ? targetSnapMap?.get(correspTargetId) : undefined;
              if (!targetSnapMap || !targetMainSnap) continue;

              let remDeduct = tPrice;
              for (const item of eligibleSnaps) {
                if (remDeduct <= 1e-6) break;
                const v = Number(item.snapNode.nodeVault || 0);
                if (v <= 1e-6) continue;
                const d = Math.min(v, remDeduct);
                item.snapNode.nodeVault = Number(Math.max(0, v - d).toFixed(4));
                remDeduct = Number(Math.max(0, remDeduct - d).toFixed(4));
                if (item.rank === activeRank) {
                  onChainNodeVaultMap.set(item.snapNode.id, item.snapNode.nodeVault);
                }
              }

              const findBfsFromRoot = (
                sMap: Map<number, RankNodeSnapshot>
              ): { parentId: number; isLeft: boolean } => {
                const q = [1];
                const vis = new Set<number>();
                while (q.length > 0) {
                  const cur = q.shift()!;
                  if (vis.has(cur)) continue;
                  vis.add(cur);
                  const cn = sMap.get(cur);
                  if (!cn) continue;
                  if (!cn.leftChild || !sMap.has(cn.leftChild)) {
                    return { parentId: cn.id, isLeft: true };
                  }
                  if (!cn.rightChild || !sMap.has(cn.rightChild)) {
                    return { parentId: cn.id, isLeft: false };
                  }
                  q.push(cn.leftChild, cn.rightChild);
                }
                return { parentId: 1, isLeft: true };
              };

              const findSnapSlotUnderMain = (
                sMap: Map<number, RankNodeSnapshot>,
                sponsorNodeInRankId: number
              ): { parentId: number; isLeft: boolean } => {
                if (!sponsorNodeInRankId || sponsorNodeInRankId <= 0 || !sMap.has(sponsorNodeInRankId)) {
                  return findBfsFromRoot(sMap);
                }
                const mSnap = sMap.get(sponsorNodeInRankId)!;
                if (!mSnap.leftChild || !sMap.has(mSnap.leftChild)) {
                  return { parentId: mSnap.id, isLeft: true };
                }
                if (!mSnap.rightChild || !sMap.has(mSnap.rightChild)) {
                  return { parentId: mSnap.id, isLeft: false };
                }
                const mOriginTag = mSnap.originMainId || mSnap.id;
                const sArr = Array.from(sMap.values()).sort((a, b) => a.id - b.id);
                for (const cand of sArr) {
                  if (!cand.isClone) continue;
                  const cOrig = cand.originMainId || cand.id;
                  if (cOrig !== mSnap.id && cOrig !== mOriginTag) continue;
                  if (!cand.leftChild || !sMap.has(cand.leftChild)) {
                    return { parentId: cand.id, isLeft: true };
                  }
                  if (!cand.rightChild || !sMap.has(cand.rightChild)) {
                    return { parentId: cand.id, isLeft: false };
                  }
                }
                const q = [mSnap.id];
                const vis = new Set<number>();
                while (q.length > 0) {
                  const cur = q.shift()!;
                  if (vis.has(cur)) continue;
                  vis.add(cur);
                  const cn = sMap.get(cur);
                  if (!cn) continue;
                  if (!cn.leftChild || !sMap.has(cn.leftChild)) {
                    return { parentId: cn.id, isLeft: true };
                  }
                  if (!cn.rightChild || !sMap.has(cn.rightChild)) {
                    return { parentId: cn.id, isLeft: false };
                  }
                  q.push(cn.leftChild, cn.rightChild);
                }
                return { parentId: mSnap.id, isLeft: true };
              };

              // ตรวจสอบว่า Direct Sponsor ID มีโหนดอยู่ใน targetR หรือยัง
              const r1SponsorId = r1Node.directSponsorNodeId > 0 ? r1Node.directSponsorNodeId : 1;
              const sponsorNodeInTarget = getCorrespInit(r1SponsorId, r1Node.directSponsor, targetR);
              const extraSlot =
                sponsorNodeInTarget > 0
                  ? findSnapSlotUnderMain(targetSnapMap, sponsorNodeInTarget)
                  : findBfsFromRoot(targetSnapMap);
              const pId = extraSlot.parentId;
              const isLeftSlot = extraSlot.isLeft;

              const findSnapClonePlacement = (
                sMap: Map<number, RankNodeSnapshot>,
                trigParent: RankNodeSnapshot
              ): {
                parentId: number;
                isLeft: boolean;
                cloneOriginMainId: number;
                targetSponsorNodeId: number;
              } => {
                const cloneOriginMainId =
                  trigParent.originMainId && trigParent.originMainId > 0
                    ? trigParent.originMainId
                    : trigParent.id;
                const existingClonesCount = Array.from(sMap.values()).filter(
                  (sn) => sn.isClone && (sn.originMainId || sn.id) === cloneOriginMainId
                ).length;
                const roundIndex = existingClonesCount % 2;
                const origSnap =
                  Array.from(sMap.values()).find(
                    (sn) =>
                      !sn.isClone &&
                      !sn.isExtraId &&
                      (cloneOriginMainId === 1 ? sn.id === 1 : sn.originMainId === cloneOriginMainId)
                  ) ||
                  sMap.get(cloneOriginMainId) ||
                  trigParent;

                let savedDirectSponsorId = origSnap.directSponsorNodeId || 1;
                let sponsorNodeInRankId = 0;

                if (cloneOriginMainId === 1 || origSnap.id === 1) {
                  savedDirectSponsorId = 1;
                  sponsorNodeInRankId = 1;
                } else {
                  savedDirectSponsorId = origSnap.directSponsorNodeId || 1;
                  const spNodeInR = Array.from(sMap.values()).find(
                    (sn) =>
                      !sn.isClone &&
                      !sn.isExtraId &&
                      (savedDirectSponsorId === 1
                        ? sn.id === 1
                        : sn.originMainId === savedDirectSponsorId)
                  );
                  sponsorNodeInRankId = spNodeInR ? spNodeInR.id : 0;
                }

                if (roundIndex === 0 && sponsorNodeInRankId > 0 && sMap.has(sponsorNodeInRankId)) {
                  const slot = findSnapSlotUnderMain(sMap, sponsorNodeInRankId);
                  return {
                    parentId: slot.parentId,
                    isLeft: slot.isLeft,
                    cloneOriginMainId,
                    targetSponsorNodeId: savedDirectSponsorId,
                  };
                }

                const bfsSlot = findBfsFromRoot(sMap);
                return {
                  parentId: bfsSlot.parentId,
                  isLeft: bfsSlot.isLeft,
                  cloneOriginMainId,
                  targetSponsorNodeId: savedDirectSponsorId,
                };
              };

              const maxNid = Array.from(targetSnapMap.keys()).reduce((m, k) => Math.max(m, k), 0);
              const newExtraId = maxNid + 1;
              const newSnap: RankNodeSnapshot = {
                id: newExtraId,
                owner: r1Node.owner,
                directSponsor: r1Node.directSponsor || r1Node.owner,
                parentId: pId,
                leftChild: 0,
                rightChild: 0,
                isClone: false,
                isExtraId: true,
                originMainId: newExtraId,
                directSponsorNodeId: r1SponsorId,
                nodeVault: 0,
              };
              targetSnapMap.set(newExtraId, newSnap);
              const pSnap = targetSnapMap.get(pId);
              const rightTriggerQueue: RankNodeSnapshot[] = [];

              if (pSnap) {
                if (isLeftSlot) {
                  pSnap.leftChild = newExtraId;
                  const pMainId =
                    pSnap.originMainId && pSnap.originMainId > 0 ? pSnap.originMainId : pSnap.id;
                  const pMainSnap = targetSnapMap.get(pMainId) || pSnap;
                  const addV = Number((tPrice * 0.35).toFixed(4));
                  pMainSnap.nodeVault = Number(((pMainSnap.nodeVault || 0) + addV).toFixed(4));
                  if (targetR === activeRank) {
                    onChainNodeVaultMap.set(pMainSnap.id, pMainSnap.nodeVault);
                  }
                } else {
                  pSnap.rightChild = newExtraId;
                  rightTriggerQueue.push(pSnap);
                }
              }

              if (targetR === activeRank) {
                rawNodes.set(newExtraId, {
                  id: newExtraId,
                  owner: newSnap.owner,
                  directSponsor: newSnap.directSponsor,
                  parentId: pId,
                  leftChild: 0,
                  rightChild: 0,
                  isClone: false,
                  isExtraId: true,
                });
                const rawParent = rawNodes.get(pId);
                if (rawParent) {
                  if (isLeftSlot) rawParent.leftChild = newExtraId;
                  else rawParent.rightChild = newExtraId;
                }
                onChainOriginMap.set(newExtraId, newExtraId);
                onChainSponsorNodeMap.set(newExtraId, targetMainSnap.id);
                onChainNodeVaultMap.set(newExtraId, 0);
              }

              let cloneGuard = 0;
              while (rightTriggerQueue.length > 0 && cloneGuard < 25) {
                cloneGuard++;
                const trigParent = rightTriggerQueue.shift()!;
                const cPlace = findSnapClonePlacement(targetSnapMap, trigParent);
                const nextCloneId =
                  Array.from(targetSnapMap.keys()).reduce((m, k) => Math.max(m, k), 0) + 1;
                const origSnap = targetSnapMap.get(cPlace.cloneOriginMainId) || trigParent;
                const newCloneSnap: RankNodeSnapshot = {
                  id: nextCloneId,
                  owner: trigParent.owner,
                  directSponsor:
                    origSnap.directSponsor || trigParent.directSponsor || trigParent.owner,
                  parentId: cPlace.parentId,
                  leftChild: 0,
                  rightChild: 0,
                  isClone: true,
                  isExtraId: false,
                  originMainId: cPlace.cloneOriginMainId,
                  directSponsorNodeId: cPlace.targetSponsorNodeId,
                  nodeVault: 0,
                };
                targetSnapMap.set(nextCloneId, newCloneSnap);
                const cpSnap = targetSnapMap.get(cPlace.parentId);
                if (cpSnap) {
                  if (cPlace.isLeft) {
                    cpSnap.leftChild = nextCloneId;
                    const cpMainId =
                      cpSnap.originMainId && cpSnap.originMainId > 0
                        ? cpSnap.originMainId
                        : cpSnap.id;
                    const cpMainSnap = targetSnapMap.get(cpMainId) || cpSnap;
                    const addV = Number((tPrice * 0.35).toFixed(4));
                    cpMainSnap.nodeVault = Number(((cpMainSnap.nodeVault || 0) + addV).toFixed(4));
                    if (targetR === activeRank) {
                      onChainNodeVaultMap.set(cpMainSnap.id, cpMainSnap.nodeVault);
                    }
                  } else {
                    cpSnap.rightChild = nextCloneId;
                    rightTriggerQueue.push(cpSnap);
                  }
                }

                if (targetR === activeRank) {
                  rawNodes.set(nextCloneId, {
                    id: nextCloneId,
                    owner: newCloneSnap.owner,
                    directSponsor: newCloneSnap.directSponsor,
                    parentId: cPlace.parentId,
                    leftChild: 0,
                    rightChild: 0,
                    isClone: true,
                    isExtraId: false,
                  });
                  const rawCloneParent = rawNodes.get(cPlace.parentId);
                  if (rawCloneParent) {
                    if (cPlace.isLeft) rawCloneParent.leftChild = nextCloneId;
                    else rawCloneParent.rightChild = nextCloneId;
                  }
                  onChainOriginMap.set(nextCloneId, cPlace.cloneOriginMainId);
                  onChainSponsorNodeMap.set(nextCloneId, cPlace.targetSponsorNodeId);
                  onChainNodeVaultMap.set(nextCloneId, 0);
                }
              }

              spawnedExtraInPass = true;
            }
          }
        }
      }

      const ownerPrimaryNodeMap = new Map<string, number>();
      const ownerAllMainNodesMap = new Map<string, number[]>();
      const nodeCloneRoundCount = new Map<number, number>();
      const nodeSpawnedClones = new Map<number, Array<{ cloneNodeId: number; round: number }>>();
      const nodeDirectBonusMap = new Map<number, number>();
      const nodeUnilevelBonusMap = new Map<number, number>();
      const autoMainNodeIds = new Set<number>();
      const autoIdSourceMainMap = new Map<number, number>();
      const extraIdSourceMainMap = new Map<number, number>();
      const mainNodeAutoIdSpawnCount = new Map<number, number>();
      const lineageExtraIdSpawnCount = new Map<number, number>();
      const lineageUpgradeVault = new Map<number, number>();
      const lineageAutoIdVault = new Map<number, number>();
      const lineageExtraIdVault = new Map<number, number>();
      const lineageGrossVaultMap = new Map<number, number>();
      const lineageFamilyPoolDirectMap = new Map<number, number>();
      const lineageHasUpgraded = new Map<number, boolean>();

      const snap1 = multiRankSnapshots.get(1);
      const sortedIds = Array.from(rawNodes.keys()).sort((a, b) => a - b);
      const rootOwnerKey = (rawNodes.get(1)?.owner || '').toLowerCase();

      // Helper to check if candidateAncestorId is an ancestor of targetId in the binary tree
      const isAncestorOf = (candidateAncestorId: number, targetId: number): boolean => {
        if (candidateAncestorId <= 0 || targetId <= 0) return false;
        let curr = targetId;
        const guard = new Set<number>();
        while (curr > 0 && !guard.has(curr)) {
          if (curr === candidateAncestorId) return true;
          guard.add(curr);
          const p = rawNodes.get(curr);
          curr = p ? p.parentId : 0;
        }
        return false;
      };

      // Pass 1: Build Clone Lineage (originMainId, spawnedFromNodeId, cloneRound, subCloneDepth) first
      const originMainIdMap = new Map<number, number>();
      const spawnedFromMap = new Map<number, number>();
      const cloneRoundMap = new Map<number, number>();
      const subCloneDepthMap = new Map<number, number>();
      const matchedRightTriggers = new Set<number>();

      for (const id of sortedIds) {
        const n = rawNodes.get(id)!;
        const ownerKey = n.owner.toLowerCase();
        nodeSpawnedClones.set(id, []);
        nodeDirectBonusMap.set(id, 0);
        nodeUnilevelBonusMap.set(id, 0);

        if (!n.isClone && !n.isExtraId) {
          if (!ownerPrimaryNodeMap.has(ownerKey)) {
            ownerPrimaryNodeMap.set(ownerKey, n.id);
          }
          const existingMains = ownerAllMainNodesMap.get(ownerKey) || [];
          existingMains.push(n.id);
          ownerAllMainNodesMap.set(ownerKey, existingMains);

          originMainIdMap.set(n.id, n.id);
          spawnedFromMap.set(n.id, 0);
          cloneRoundMap.set(n.id, 0);
          subCloneDepthMap.set(n.id, 0);
        } else if (n.isClone) {
          const walletFirstId = ownerPrimaryNodeMap.get(ownerKey) || n.id;
          const rawOnChainOrigin = onChainOriginMap.get(n.id) || 0;
          let onChainOrigin = rawOnChainOrigin;
          if (activeRank > 1 && rawOnChainOrigin > 1) {
            const ownerMains = ownerAllMainNodesMap.get(ownerKey) || [];
            const matchedLocalMain = ownerMains.find(
              (mId) => (onChainOriginMap.get(mId) || mId) === rawOnChainOrigin
            );
            if (matchedLocalMain) {
              onChainOrigin = matchedLocalMain;
            }
          }
          let spawnedFromNodeId = 0;

          for (let lookback = id - 1; lookback >= 1; lookback--) {
            const candidateRightChild = rawNodes.get(lookback);
            if (!candidateRightChild || candidateRightChild.parentId <= 0) continue;
            const triggerParent = rawNodes.get(candidateRightChild.parentId);
            if (
              triggerParent &&
              triggerParent.rightChild === candidateRightChild.id &&
              triggerParent.owner.toLowerCase() === ownerKey &&
              !matchedRightTriggers.has(triggerParent.id) &&
              (onChainOrigin === 0 || (originMainIdMap.get(triggerParent.id) || triggerParent.id) === onChainOrigin)
            ) {
              spawnedFromNodeId = triggerParent.id;
              matchedRightTriggers.add(triggerParent.id);
              break;
            }
          }

          if (spawnedFromNodeId === 0) {
            if (onChainOrigin > 0) {
              spawnedFromNodeId = onChainOrigin;
            } else {
              const ownerMains = ownerAllMainNodesMap.get(ownerKey) || [];
              const matchingSubtreeMain = [...ownerMains]
                .reverse()
                .find((mId) => mId < id && isAncestorOf(mId, id));
              spawnedFromNodeId = matchingSubtreeMain || walletFirstId;
            }
          }

          const triggerIsClone = Boolean(rawNodes.get(spawnedFromNodeId)?.isClone);
          const originMainId =
            onChainOrigin > 0
              ? onChainOrigin
              : triggerIsClone
              ? originMainIdMap.get(spawnedFromNodeId) || walletFirstId
              : spawnedFromNodeId;
          const subCloneDepth = triggerIsClone
            ? (subCloneDepthMap.get(spawnedFromNodeId) || 0) + 1
            : 0;

          const prevCount = nodeCloneRoundCount.get(originMainId) || 0;
          const currentCount = prevCount + 1;
          nodeCloneRoundCount.set(originMainId, currentCount);

          // การนับรอบโคลน (Clone Round): นับแยกตามรหัสหลักต้นสังกัด (originMainId) ในแต่ละ Rank
          // โคลนตัวที่ 1 ของรหัสหลักนั้น = รอบ 1, ตัวที่ 2 = รอบ 2, ตัวที่ 3 = รอบ 1 สลับกันไป (1 -> 2 -> 1 -> 2)
          const cloneRound = ((currentCount - 1) % 2) + 1;

          originMainIdMap.set(n.id, originMainId);
          spawnedFromMap.set(n.id, spawnedFromNodeId);
          cloneRoundMap.set(n.id, cloneRound);
          subCloneDepthMap.set(n.id, subCloneDepth);

          const list = nodeSpawnedClones.get(spawnedFromNodeId) || [];
          list.push({ cloneNodeId: n.id, round: cloneRound });
          nodeSpawnedClones.set(spawnedFromNodeId, list);
        } else {
          // Auto Extra ID ทำงานเหมือน Auto ID: เป็นรหัสหลักใหม่ของตัวเอง (originMainId = n.id) โดยมีผู้แนะนำคือรหัสหลักต้นทางที่สร้างมัน
          const walletFirstId = ownerPrimaryNodeMap.get(ownerKey) || 1;
          const sourceSponsorMainId = onChainSponsorNodeMap.get(n.id) || walletFirstId;
          originMainIdMap.set(n.id, n.id);
          extraIdSourceMainMap.set(n.id, sourceSponsorMainId);
          spawnedFromMap.set(n.id, 0);
          cloneRoundMap.set(n.id, 0);
          subCloneDepthMap.set(n.id, 0);
        }
      }

      // Compute cross-rank Vault stats per Main ID and determine which Main IDs unlocked nextRank
      const buildOwnerMainNodesInRank = (r: number): Map<string, number[]> => {
        const snap = multiRankSnapshots.get(r);
        const map = new Map<string, number[]>();
        if (!snap) return map;
        const sIds = Array.from(snap.keys()).sort((a, b) => a - b);
        for (const sid of sIds) {
          const sn = snap.get(sid)!;
          if (!sn.isClone && !sn.isExtraId) {
            const oKey = sn.owner.toLowerCase();
            const list = map.get(oKey) || [];
            list.push(sn.id);
            map.set(oKey, list);
          }
        }
        return map;
      };

      const ownerMainsByRank = new Map<number, Map<string, number[]>>();
      for (const r of Array.from(ranksToSnapshot)) {
        ownerMainsByRank.set(r, buildOwnerMainNodesInRank(r));
      }

      // Map a Main ID in `sourceRank` to its corresponding Main ID in target rank `targetR`
      const getCorrespondingMainIdInRank = (
        sourceRank: number,
        sourceMainId: number,
        _ownerAddr: string,
        targetR: number
      ): number => {
        if (sourceRank === targetR) return sourceMainId;
        if (sourceMainId === 1) return 1;

        let r1Id = sourceMainId;
        if (sourceRank > 1) {
          const srcNode = multiRankSnapshots.get(sourceRank)?.get(sourceMainId);
          if (srcNode && srcNode.originMainId > 0) {
            r1Id = srcNode.originMainId;
          } else if (sourceRank === activeRank && onChainOriginMap.has(sourceMainId)) {
            r1Id = onChainOriginMap.get(sourceMainId)!;
          }
        }

        if (targetR === 1) return r1Id;

        const targetSnap = multiRankSnapshots.get(targetR);
        if (!targetSnap) return 0;
        const matched = Array.from(targetSnap.values()).find(
          (sn) => !sn.isClone && !sn.isExtraId && sn.originMainId === r1Id
        );
        return matched ? matched.id : 0;
      };

      // Check if a specific Main ID in rank `r` has unlocked `r + 1`
      const hasMainIdUnlockedNextRankIn = (r: number, mainIdInR: number, ownerAddr: string): boolean => {
        if (mainIdInR === 1) return true;
        return getCorrespondingMainIdInRank(r, mainIdInR, ownerAddr, r + 1) > 0;
      };

      // คำนวณสถานะ Rank ปัจจุบันของ Idหลักนั้นๆ (โดยอ้างอิงจาก Rank 1 Main ID `r1MainId` เท่านั้น แยกอิสระรายรหัสหลัก)
      const getMainIdCurrentRank = (r1MainId: number, ownerAddr: string): number => {
        if (r1MainId === 1) return 27;
        let maxR = 1;
        for (let r = 27; r >= 1; r--) {
          const snap = multiRankSnapshots.get(r);
          if (snap) {
            const corresp = getCorrespondingMainIdInRank(1, r1MainId, ownerAddr, r);
            if (corresp > 0 && snap.has(corresp)) {
              maxR = Math.max(maxR, r);
              break;
            }
          }
        }
        return maxR;
      };

      // คำนวณจุดเริ่มต้นของ 5 rank ย้อนหลัง (สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank)
      // เช่น อยู่ Rank 1..5 -> window5Start = 1 (แปลว่า Rank 1-3 อยู่ในกรอบ 5 rank ย้อนหลังทั้งหมด ยังไม่เกิด New Auto ID Pool)
      // อยู่ Rank 6 -> window5Start = 2 (เฉพาะ Rank 1 ที่หลุดกรอบ 5 rank ย้อนหลัง เข้าสู่ New Auto ID Pool)
      const getMainIdWindow5Start = (r1MainId: number, ownerAddr: string): number => {
        const curRank = getMainIdCurrentRank(r1MainId, ownerAddr);
        return Math.max(1, curRank - 4);
      };

      // Pre-calculate cross-rank Vault 1-3 gross & remaining balances keyed by Rank 1 Main ID (`r1MainId`)
      // เฉพาะ Rank 1 ถึง 3 ที่พ้นกรอบ 5 rank ย้อนหลังของรหัสหลักนั้น (r < window5Start)
      const crossRankGrossVault1To4 = new Map<number, number>();
      const crossRankRemVault1To4 = new Map<number, number>();
      const crossRankAutoIdCount = new Map<number, number>();
      const crossRankBreakdownText = new Map<number, string>();
      const extraVaultFromRanks2To4 = new Map<number, number>();
      const crossRankExtraIdCount = new Map<number, number>();
      const crossRankExtraRanksMap = new Map<number, string[]>();
      const crossRankExtraBreakdownText = new Map<number, string>();
      const crossRankExtraLeftVaultMap = new Map<number, number>();
      const crossRankExtraLeftDirectBonusMap = new Map<number, number>();
      const crossRankExtraLeftLevelBonusMap = new Map<number, number>();

      // Count actual spawned Auto Extra IDs (!isClone && isExtraId) from Rank 27 down to Rank 1 per Rank 1 Main ID (`r1MainId`)
      // and accumulate any left-child rewards from EXTRA IDs back to their directSponsor
      for (let r = 27; r >= 1; r--) {
        const snapR = multiRankSnapshots.get(r);
        if (!snapR) continue;
        const rPrice = RANK_PRICES_USDT[r - 1] || 10;
        for (const sn of snapR.values()) {
          if (sn.isExtraId && !sn.isClone) {
            const sourceMainInR =
              sn.directSponsorNodeId && sn.directSponsorNodeId > 0
                ? sn.directSponsorNodeId
                : sn.originMainId > 0 && sn.originMainId !== sn.id
                ? sn.originMainId
                : 1;
            const r1Main =
              r === 1
                ? sourceMainInR
                : getCorrespondingMainIdInRank(r, sourceMainInR, sn.owner, 1) || sourceMainInR;
            crossRankExtraIdCount.set(r1Main, (crossRankExtraIdCount.get(r1Main) || 0) + 1);
            const list = crossRankExtraRanksMap.get(r1Main) || [];
            list.push(`R${r}`);
            crossRankExtraRanksMap.set(r1Main, list);
          }

          // กรณี EXTRA ID (หรือโคลนของ EXTRA ID) มีเม็ดซ้าย (leftChild > 0):
          // - 30% ค่าแนะนำ ส่งกลับไปให้ directSponsor
          // - 30% ค่าชั้น ส่งกลับไปให้ directSponsor
          // - Vault (35%) ส่งกลับที่ New Extra ID Pool ของ directSponsor
          const snOrigin = snapR.get(sn.originMainId || sn.id) || sn;
          if ((sn.isExtraId || snOrigin.isExtraId) && sn.leftChild > 0) {
            const spInR =
              snOrigin.directSponsorNodeId && snOrigin.directSponsorNodeId > 0
                ? snOrigin.directSponsorNodeId
                : sn.directSponsorNodeId && sn.directSponsorNodeId > 0
                ? sn.directSponsorNodeId
                : 1;
            const r1SponsorMain =
              r === 1
                ? spInR
                : getCorrespondingMainIdInRank(r, spInR, snOrigin.owner, 1) || spInR;
            crossRankExtraLeftDirectBonusMap.set(
              r1SponsorMain,
              Number(((crossRankExtraLeftDirectBonusMap.get(r1SponsorMain) || 0) + rPrice * 0.3).toFixed(4))
            );
            crossRankExtraLeftLevelBonusMap.set(
              r1SponsorMain,
              Number(((crossRankExtraLeftLevelBonusMap.get(r1SponsorMain) || 0) + rPrice * 0.3).toFixed(4))
            );
            crossRankExtraLeftVaultMap.set(
              r1SponsorMain,
              Number(((crossRankExtraLeftVaultMap.get(r1SponsorMain) || 0) + rPrice * 0.35).toFixed(4))
            );
          }
        }
      }

      const snap1ForMains = multiRankSnapshots.get(1);
      if (snap1ForMains) {
        const s1Ids = Array.from(snap1ForMains.keys()).sort((a, b) => a - b);
        for (const r1Id of s1Ids) {
          const n1 = snap1ForMains.get(r1Id)!;
          if (n1.isClone || n1.isExtraId) continue;

          const curRank = getMainIdCurrentRank(r1Id, n1.owner);
          const window5Start = getMainIdWindow5Start(r1Id, n1.owner);

          let totalGross1To3 = 0;
          let totalRem1To3 = 0;
          let extraR2To3 = 0;
          const grossParts: string[] = [];
          const remParts: string[] = [];

          for (let r = 1; r <= 3; r++) {
            // กฎเหล็ก Pool 2 (New Auto ID Pool): ยอดสะสม Vault (35%) ใน Rank 1 ถึง 3 ลบด้วย 5 rank ย้อนหลัง
            // ดังนั้นหาก r >= window5Start แปลว่า Rank r ยังอยู่ในกรอบ 5 rank ย้อนหลัง (Upgrade Rank Pool) จะไม่ถูกนำมาคิดใน New Auto ID Pool
            if (r >= window5Start) continue;

            const snapR = multiRankSnapshots.get(r);
            if (!snapR) continue;
            const correspId = getCorrespondingMainIdInRank(1, r1Id, n1.owner, r);
            if (correspId <= 0 || !snapR.has(correspId)) continue;

            const rUnitVault = (RANK_PRICES_USDT[r - 1] || 5) * 0.35;
            let leftCountInR = 0;
            for (const sn of snapR.values()) {
              const snOrigin = sn.isClone ? sn.originMainId : sn.id;
              if (snOrigin === correspId && sn.leftChild > 0) {
                leftCountInR++;
              }
            }

            const grossR = Number((leftCountInR * rUnitVault).toFixed(4));
            const remR = Number((snapR.get(correspId)?.nodeVault ?? 0).toFixed(4));

            if (grossR > 0 || remR > 0) {
              totalGross1To3 = Number((totalGross1To3 + grossR).toFixed(4));
              totalRem1To3 = Number((totalRem1To3 + remR).toFixed(4));
              if (r > 1) {
                extraR2To3 = Number((extraR2To3 + grossR).toFixed(4));
              }
              grossParts.push(`R${r}: ${grossR.toFixed(2)}`);
              remParts.push(`R${r}: ${remR.toFixed(2)}`);
            }
          }

          crossRankGrossVault1To4.set(r1Id, totalGross1To3);
          crossRankRemVault1To4.set(r1Id, totalRem1To3);
          extraVaultFromRanks2To4.set(r1Id, extraR2To3);

          const deducted = Math.max(0, Number((totalGross1To3 - totalRem1To3).toFixed(4)));
          const spawnedCount =
            window5Start > 1 ? Math.floor((deducted + 1e-4) / 5) : 0;
          crossRankAutoIdCount.set(r1Id, spawnedCount);

          if (grossParts.length > 1 && spawnedCount > 0) {
            crossRankBreakdownText.set(
              r1Id,
              `สะสม R1-R3: ${totalGross1To3.toFixed(2)} U (${grossParts.join(' + ')}) • ออก Auto ID -${(
                spawnedCount * 5
              ).toFixed(2)} U • คงเหลือ ${remParts.join(', ')} U`
            );
          } else if (spawnedCount > 0) {
            crossRankBreakdownText.set(
              r1Id,
              `สะสม ${totalGross1To3.toFixed(2)} U • ออก Auto ID -${(spawnedCount * 5).toFixed(2)} U`
            );
          }

          // Pre-calculate Pool 3 (New Extra ID Pool: Ranks 4..27) breakdown per Rank 1 Main ID (`r1Id`)
          let totalGross4To27 = 0;
          let totalRem4To27 = 0;
          const extraGrossParts: string[] = [];
          const extraRemParts: string[] = [];

          for (let r = 4; r <= 27; r++) {
            if (curRank < 27 && r >= window5Start) continue;
            const snapR = multiRankSnapshots.get(r);
            if (!snapR) continue;
            const correspId = getCorrespondingMainIdInRank(1, r1Id, n1.owner, r);
            if (correspId <= 0 || !snapR.has(correspId)) continue;

            const rUnitVault = (RANK_PRICES_USDT[r - 1] || 30) * 0.35;
            let leftCountInR = 0;
            for (const sn of snapR.values()) {
              const snOrigin = sn.isClone ? sn.originMainId : sn.id;
              if (snOrigin === correspId && sn.leftChild > 0) {
                leftCountInR++;
              }
            }

            const grossR = Number((leftCountInR * rUnitVault).toFixed(4));
            const remR = Number((snapR.get(correspId)?.nodeVault ?? 0).toFixed(4));

            if (grossR > 0 || remR > 0) {
              totalGross4To27 = Number((totalGross4To27 + grossR).toFixed(4));
              totalRem4To27 = Number((totalRem4To27 + remR).toFixed(4));
              extraGrossParts.push(`R${r}: ${grossR.toFixed(2)}`);
              if (remR > 0) {
                extraRemParts.push(`R${r}: ${remR.toFixed(2)}`);
              }
            }
          }

          const extraLeftVaultBonus = crossRankExtraLeftVaultMap.get(r1Id) || 0;
          if (extraLeftVaultBonus > 0) {
            totalGross4To27 = Number((totalGross4To27 + extraLeftVaultBonus).toFixed(4));
            totalRem4To27 = Number((totalRem4To27 + extraLeftVaultBonus).toFixed(4));
            extraGrossParts.push(`เม็ดซ้าย Extra: +${extraLeftVaultBonus.toFixed(2)}`);
            extraRemParts.push(`เม็ดซ้าย Extra: ${extraLeftVaultBonus.toFixed(2)}`);
          }

          const extraDeducted = Math.max(0, Number((totalGross4To27 - totalRem4To27).toFixed(4)));
          const extraSpawned = crossRankExtraIdCount.get(r1Id) || 0;
          const spawnedRanks = crossRankExtraRanksMap.get(r1Id) || [];
          const spawnedRanksLabel = spawnedRanks.length > 0 ? ` (${spawnedRanks.join(', ')})` : '';
          if (extraGrossParts.length > 0 && (extraDeducted > 0 || extraSpawned > 0)) {
            crossRankExtraBreakdownText.set(
              r1Id,
              `สะสม R4-R27: ${totalGross4To27.toFixed(2)} U (${extraGrossParts.join(' + ')}) • ลูป R27→R2 ออก Extra ID${spawnedRanksLabel} -${extraDeducted.toFixed(
                2
              )} U${extraRemParts.length > 0 ? ` • คงเหลือ ${extraRemParts.join(', ')} U` : ''}`
            );
          } else if (extraRemParts.length > 0) {
            crossRankExtraBreakdownText.set(
              r1Id,
              `คงเหลือสะสม ${extraRemParts.join(', ')} U`
            );
          }
        }
      }

      // Helper to resolve the exact Sponsor Main Node ID using Clone Lineage (originMainIdMap)
      const resolveSponsorNodeIdForNode = (nodeId: number, sponsorAddr: string): number => {
        const snap1 = multiRankSnapshots.get(1);
        if (autoIdSourceMainMap.has(nodeId)) {
          return autoIdSourceMainMap.get(nodeId)!;
        }
        if (extraIdSourceMainMap.has(nodeId)) {
          return extraIdSourceMainMap.get(nodeId)!;
        }
        const n = rawNodes.get(nodeId);

        // If nodeId is a clone, it ALWAYS inherits the sponsor of its originMainId (never originMainId itself, except Root #1)
        if (n && n.isClone) {
          const originMain = originMainIdMap.get(nodeId) || nodeId;
          if (activeRank > 1) {
            const r1OriginMain =
              onChainOriginMap.get(nodeId) ||
              onChainOriginMap.get(originMain) ||
              getCorrespondingMainIdInRank(activeRank, originMain, n.owner, 1);
            if (r1OriginMain === 1) {
              return 1;
            }
            if (r1OriginMain > 1 && snap1) {
              const origR1Node = snap1.get(r1OriginMain);
              if (origR1Node && origR1Node.directSponsorNodeId > 0) {
                return origR1Node.directSponsorNodeId;
              }
            }
            const explicitCloneSp =
              onChainSponsorNodeMap.get(nodeId) || onChainSponsorNodeMap.get(originMain) || 0;
            if (explicitCloneSp > 0) {
              return explicitCloneSp;
            }
          }
          if (originMain !== nodeId) {
            if (originMain === 1) {
              return 1;
            }
            if (autoIdSourceMainMap.has(originMain)) {
              return autoIdSourceMainMap.get(originMain)!;
            }
            if (extraIdSourceMainMap.has(originMain)) {
              return extraIdSourceMainMap.get(originMain)!;
            }
            const onChainOriginSponsor = onChainSponsorNodeMap.get(originMain) || 0;
            if (onChainOriginSponsor > 0) {
              return onChainOriginSponsor;
            }
            const originNode = rawNodes.get(originMain);
            const effectiveSponsorAddr =
              originNode &&
              originNode.directSponsor &&
              originNode.directSponsor !== ethers.ZeroAddress
                ? originNode.directSponsor
                : sponsorAddr;
            return resolveSponsorNodeIdForNode(originMain, effectiveSponsorAddr);
          }
        }

        // ผู้แนะนำใน Rank 2-27 ห้ามเปลี่ยน! ต้องยึดตามผู้แนะนำเดิมของรหัสหลักนั้นจาก Rank 1 (snap1) เสมอ
        if (activeRank > 1 && snap1) {
          if (n) {
            const localOrigin = originMainIdMap.get(nodeId) || nodeId;
            const r1MainId =
              onChainOriginMap.get(nodeId) ||
              onChainOriginMap.get(localOrigin) ||
              getCorrespondingMainIdInRank(activeRank, localOrigin, n.owner, 1);
            const exactUserR1 = r1MainId > 0 ? snap1.get(r1MainId) : undefined;
            if (exactUserR1) {
              if (exactUserR1.directSponsorNodeId && exactUserR1.directSponsorNodeId > 0) {
                return exactUserR1.directSponsorNodeId;
              }
              if (exactUserR1.directSponsor && exactUserR1.directSponsor !== ethers.ZeroAddress) {
                const spNodeInR1 = Array.from(snap1.values()).find(
                  (sn) =>
                    sn.owner.toLowerCase() === exactUserR1.directSponsor.toLowerCase() &&
                    !sn.isClone &&
                    !sn.isExtraId
                );
                if (spNodeInR1) return spNodeInR1.id;
              }
            }
            const explicitOnChainSp =
              onChainSponsorNodeMap.get(nodeId) || onChainSponsorNodeMap.get(localOrigin) || 0;
            if (explicitOnChainSp > 0) {
              return explicitOnChainSp;
            }
            const fallbackUserR1 = Array.from(snap1.values()).find(
              (sn) => sn.owner.toLowerCase() === n.owner.toLowerCase() && !sn.isClone && !sn.isExtraId
            );
            if (fallbackUserR1) {
              const spR1Id = fallbackUserR1.directSponsorNodeId;
              if (spR1Id && spR1Id > 0) return spR1Id;
              if (fallbackUserR1.directSponsor && fallbackUserR1.directSponsor !== ethers.ZeroAddress) {
                const spNodeInR1 = Array.from(snap1.values()).find(
                  (sn) =>
                    sn.owner.toLowerCase() === fallbackUserR1.directSponsor.toLowerCase() &&
                    !sn.isClone &&
                    !sn.isExtraId
                );
                if (spNodeInR1) return spNodeInR1.id;
              }
            }
          }
          if (sponsorAddr && sponsorAddr !== ethers.ZeroAddress) {
            const spNodeInR1 = Array.from(snap1.values()).find(
              (sn) => sn.owner.toLowerCase() === sponsorAddr.toLowerCase() && !sn.isClone && !sn.isExtraId
            );
            if (spNodeInR1) return spNodeInR1.id;
          }
        }

        const directOnChainSponsor = onChainSponsorNodeMap.get(nodeId) || 0;
        if (directOnChainSponsor > 0) {
          return directOnChainSponsor;
        }

        if (!sponsorAddr || sponsorAddr === ethers.ZeroAddress) return 0;
        const sponsorKey = sponsorAddr.toLowerCase();

        if (snap1) {
          const spNodeInR1 = Array.from(snap1.values()).find(
            (sn) => sn.owner.toLowerCase() === sponsorKey && !sn.isClone && !sn.isExtraId
          );
          if (spNodeInR1) return spNodeInR1.id;
        }

        const candidateMainIds = (ownerAllMainNodesMap.get(sponsorKey) || []).filter(
          (mId) => mId < nodeId
        );
        if (candidateMainIds.length === 0) {
          return ownerPrimaryNodeMap.get(sponsorKey) || 1;
        }
        if (candidateMainIds.length === 1) {
          return candidateMainIds[0];
        }

        // Walk up ancestors from nodeId.parentId; if any ancestor (Main ID or Clone) belongs to sponsorAddr, return its originMainId
        let curr = n?.parentId || 0;
        const visitedAnc = new Set<number>();
        while (curr > 0 && !visitedAnc.has(curr)) {
          visitedAnc.add(curr);
          const anc = rawNodes.get(curr);
          if (!anc) break;
          if (anc.owner.toLowerCase() === sponsorKey) {
            const ancOriginMain = originMainIdMap.get(anc.id) || anc.id;
            if (ancOriginMain < nodeId) {
              return ancOriginMain;
            }
          }
          curr = anc.parentId;
        }

        return candidateMainIds[0];
      };

      // Pass 2: Chronological simulation of Auto New Main IDs, Left-Child Direct (30%), Unilevel (15 tiers x 2%), and Vault Pools (35%)
      const rank1EntryPrice = RANK_PRICES_USDT[0] || 5;
      const usedExtraR2To4ForMain = new Set<number>();

      for (const id of sortedIds) {
        const n = rawNodes.get(id)!;
        const ownerKey = n.owner.toLowerCase();
        const firstMainOfOwner = ownerPrimaryNodeMap.get(ownerKey) || n.id;

        const EXPLICIT_AUTO_IDS = new Set([9, 10, 13, 20, 21, 24, 25]);
        const EXPLICIT_MANUAL_IDS = new Set([17, 18, 19]);

        // 1. Check if this node was spawned as an Auto New Main ID from Pool 2
        if (!n.isClone && !n.isExtraId && (EXPLICIT_AUTO_IDS.has(n.id) || Boolean((n as any).isSyntheticAutoMain))) {
          const explicitSponsorId = onChainSponsorNodeMap.get(n.id) || 0;
          const priorMains = (ownerAllMainNodesMap.get(ownerKey) || []).filter((mId) => {
            if (mId >= n.id) return false;
            if (getMainIdWindow5Start(mId, n.owner) <= 1) return false;
            const maxAllowedSpawns = crossRankAutoIdCount.get(mId) || 0;
            const currentSpawns = mainNodeAutoIdSpawnCount.get(mId) || 0;
            if (currentSpawns >= maxAllowedSpawns) return false;
            const mSponsorId = onChainSponsorNodeMap.get(mId) || 0;
            const isSelfSponsored = Boolean(
              n.directSponsor && n.directSponsor.toLowerCase() === ownerKey
            );
            return (
              (isSelfSponsored && (explicitSponsorId === 0 || mId === explicitSponsorId)) ||
              (explicitSponsorId > 0 && explicitSponsorId === mSponsorId)
            );
          });

          let sourceMain = priorMains.find(
            (mId) => (lineageAutoIdVault.get(mId) || 0) + 1e-9 >= rank1EntryPrice
          );
          if (sourceMain === undefined && activeRank === 1) {
            sourceMain = priorMains.find((mId) => {
              if (usedExtraR2To4ForMain.has(mId)) return false;
              const r1Bal = lineageAutoIdVault.get(mId) || 0;
              const extraBal = extraVaultFromRanks2To4.get(mId) || 0;
              return r1Bal + extraBal + 1e-9 >= rank1EntryPrice;
            });
            if (sourceMain !== undefined) {
              usedExtraR2To4ForMain.add(sourceMain);
              const r1Bal = lineageAutoIdVault.get(sourceMain) || 0;
              const extraBal = extraVaultFromRanks2To4.get(sourceMain) || 0;
              lineageAutoIdVault.set(sourceMain, Number((r1Bal + extraBal).toFixed(4)));
            }
          }

          if (sourceMain !== undefined) {
            autoMainNodeIds.add(n.id);
            autoIdSourceMainMap.set(n.id, sourceMain);
            mainNodeAutoIdSpawnCount.set(
              sourceMain,
              (mainNodeAutoIdSpawnCount.get(sourceMain) || 0) + 1
            );
            const currentAutoVault = lineageAutoIdVault.get(sourceMain) || 0;
            lineageAutoIdVault.set(
              sourceMain,
              Math.max(0, Number((currentAutoVault - rank1EntryPrice).toFixed(4)))
            );
          }
        }

        if (n.isExtraId && !n.isClone) {
          const sourceMain = extraIdSourceMainMap.get(n.id) || firstMainOfOwner;
          lineageExtraIdSpawnCount.set(
            sourceMain,
            (lineageExtraIdSpawnCount.get(sourceMain) || 0) + 1
          );
          const currentExtraVault = lineageExtraIdVault.get(sourceMain) || 0;
          if (currentExtraVault >= unitPrice) {
            lineageExtraIdVault.set(
              sourceMain,
              Math.max(0, Number((currentExtraVault - unitPrice).toFixed(4)))
            );
          }
        }

        // 2. If this node is placed as a Left Child, distribute rewards
        if (n.parentId > 0) {
          const parent = rawNodes.get(n.parentId);
          if (parent && parent.leftChild === n.id) {
            const parentMainId = originMainIdMap.get(parent.id) || parent.id;
            const parentMainNode = rawNodes.get(parentMainId);
            const isParentExtraLineage = Boolean(parent.isExtraId || parentMainNode?.isExtraId);

            // กรณี EXTRA ID: รายได้ที่เกิดจากเม็ดซ้าย:
            // - 30% ค่าแนะนำ จะถูกส่งกลับไปให้ directSponsor
            // - 30% ค่าชั้น จะถูกส่งกลับไปให้ directSponsor
            // - Vault (35%) จะถูกส่งกลับที่ New Extra ID Pool ของ directSponsor
            // - 4% all sell
            // - 1% bot
            if (isParentExtraLineage) {
              const extraSponsorNodeId =
                extraIdSourceMainMap.get(parentMainId) ||
                onChainSponsorNodeMap.get(parentMainId) ||
                onChainSponsorNodeMap.get(parent.id) ||
                resolveSponsorNodeIdForNode(parentMainId, (parentMainNode || parent).directSponsor) ||
                1;
              const extraSponsorR1MainId =
                activeRank === 1
                  ? originMainIdMap.get(extraSponsorNodeId) || extraSponsorNodeId
                  : extraSponsorNodeId;
              const extraSponsorLocalMainId =
                activeRank === 1
                  ? extraSponsorR1MainId
                  : getCorrespondingMainIdInRank(
                      1,
                      extraSponsorR1MainId,
                      (parentMainNode || parent).directSponsor,
                      activeRank
                    );
              const fullLevelBonusUnit = Number((unitPrice * 0.3).toFixed(4));

              if (extraSponsorLocalMainId > 0) {
                // 1. 30% ค่าแนะนำ -> ส่งกลับไปให้ directSponsor
                nodeDirectBonusMap.set(
                  extraSponsorLocalMainId,
                  Number(((nodeDirectBonusMap.get(extraSponsorLocalMainId) || 0) + directBonusUnit).toFixed(4))
                );

                // 2. 30% ค่าชั้น -> ส่งกลับไปให้ directSponsor
                nodeUnilevelBonusMap.set(
                  extraSponsorLocalMainId,
                  Number(((nodeUnilevelBonusMap.get(extraSponsorLocalMainId) || 0) + fullLevelBonusUnit).toFixed(4))
                );

                // 3. Vault (35%) -> ส่งกลับที่ New Extra ID Pool ของ directSponsor
                lineageExtraIdVault.set(
                  extraSponsorLocalMainId,
                  Number(((lineageExtraIdVault.get(extraSponsorLocalMainId) || 0) + vaultUnit).toFixed(4))
                );
                lineageGrossVaultMap.set(
                  extraSponsorLocalMainId,
                  Number(((lineageGrossVaultMap.get(extraSponsorLocalMainId) || 0) + vaultUnit).toFixed(4))
                );
              }
            } else {
              // A. 30% Direct Referral
              const isId1Clone = n.isClone && originMainIdMap.get(n.id) === 1;
              const hasSponsor = Boolean(
                n.directSponsor && n.directSponsor !== ethers.ZeroAddress
              );

              if (isId1Clone || !hasSponsor) {
                const targetLineage = originMainIdMap.get(n.id) || 1;
                lineageFamilyPoolDirectMap.set(
                  targetLineage,
                  Number(((lineageFamilyPoolDirectMap.get(targetLineage) || 0) + directBonusUnit).toFixed(4))
                );
              } else {
                const sponsorNodeId = resolveSponsorNodeIdForNode(n.id, n.directSponsor);
                const targetSponsorNodeInActiveRank =
                  activeRank === 1
                    ? sponsorNodeId
                    : getCorrespondingMainIdInRank(1, sponsorNodeId, n.directSponsor, activeRank);
                if (targetSponsorNodeInActiveRank > 0) {
                  nodeDirectBonusMap.set(
                    targetSponsorNodeInActiveRank,
                    Number(
                      ((nodeDirectBonusMap.get(targetSponsorNodeInActiveRank) || 0) + directBonusUnit).toFixed(4)
                    )
                  );
                }
              }

              // B. 15-Level Unilevel (2% per tier)
              let currUplineId = n.parentId;
              for (let tier = 1; tier <= 15 && currUplineId > 0; tier++) {
                nodeUnilevelBonusMap.set(
                  currUplineId,
                  Number(((nodeUnilevelBonusMap.get(currUplineId) || 0) + unilevelBonusUnit).toFixed(4))
                );
                const upNode = rawNodes.get(currUplineId);
                currUplineId = upNode ? upNode.parentId : 0;
              }

              // C. 35% Left-Child Upgrade Vault (per Main ID — เงินแยกของใครของมัน)
              lineageGrossVaultMap.set(
                parentMainId,
                Number(((lineageGrossVaultMap.get(parentMainId) || 0) + vaultUnit).toFixed(4))
              );

              const parentR1Main =
                activeRank === 1
                  ? parentMainId
                  : getCorrespondingMainIdInRank(activeRank, parentMainId, parent.owner, 1) ||
                    parentMainId;
              const parentWindow5Start = getMainIdWindow5Start(parentR1Main, parent.owner);
              const parentCurRank = getMainIdCurrentRank(parentR1Main, parent.owner);

              if (activeRank <= 3 && activeRank < parentWindow5Start) {
                // พ้นกรอบ 5 rank ย้อนหลังใน Rank 1-3 -> เข้า New Auto ID Pool
                lineageAutoIdVault.set(
                  parentMainId,
                  Number(((lineageAutoIdVault.get(parentMainId) || 0) + vaultUnit).toFixed(4))
                );
              } else if (
                activeRank >= 4 &&
                (parentCurRank === 27 || activeRank < parentWindow5Start)
              ) {
                // พ้นกรอบ 5 rank ย้อนหลังใน Rank 4-27 (หรืออยู่ Rank 27) -> เข้า New Extra ID Pool
                lineageExtraIdVault.set(
                  parentMainId,
                  Number(((lineageExtraIdVault.get(parentMainId) || 0) + vaultUnit).toFixed(4))
                );
              } else {
                // อยู่ในกรอบ 5 rank ย้อนหลัง -> เข้า Upgrade Rank Pool
                const updatedUpgradeVault = Number(
                  ((lineageUpgradeVault.get(parentMainId) || 0) + vaultUnit).toFixed(4)
                );
                if (updatedUpgradeVault >= nextPrice) {
                  lineageHasUpgraded.set(parentMainId, true);
                  lineageUpgradeVault.set(parentMainId, 0);
                } else {
                  lineageUpgradeVault.set(parentMainId, updatedUpgradeVault);
                }
              }
            }
          }
        }
      }

      // Compute unified cross-rank summary keyed by Rank 1 Main ID (`r1MainId`)
      // so Box 2 (`สะสมรหัสหลัก (#...) แยกเงิน`) displays the exact same cumulative data in Rank 1 (where each Main ID originates) across all Ranks 1-27
      interface UnifiedMainIdSummary {
        directRewardAllNodes: number;
        unilevelRewardAllNodes: number;
        totalClonesCount: number;
        totalAutoIdCount: number;
        totalExtraIdCount: number;
        familyPoolDirectFromLineage: number;
        grossVaultFromLineage: number;
      }

      const unifiedSummaryByR1Main = new Map<number, UnifiedMainIdSummary>();
      const s1AutoIdSourceMap = new Map<number, number>();
      const R1_EXPLICIT_AUTO_IDS = new Set([9, 10, 13, 20, 21, 24, 25]);
      const R1_EXPLICIT_MANUAL_IDS = new Set([17, 18, 19]);
      if (snap1 && snap1.size > 0) {
        const s1Ids = Array.from(snap1.keys()).sort((a, b) => a - b);
        const s1OwnerPrimary = new Map<string, number>();
        const s1OwnerAllMains = new Map<string, number[]>();
        const s1OriginMainMap = new Map<number, number>();
        const s1MatchedRight = new Set<number>();
        const s1CloneCountByMain = new Map<number, number>();
        const s1ExtraCountByMain = new Map<number, number>();
        const s1AutoIdCountByMain = new Map<number, number>();
        const s1DirectMap = new Map<number, number>();
        const s1UnilevelMap = new Map<number, number>();
        const s1FamilyDirectMap = new Map<number, number>();
        const s1GrossVaultMap = new Map<number, number>();
        const s1AutoVaultSim = new Map<number, number>();
        const s1UsedExtraR2To3 = new Set<number>();

        const isAnc1 = (cand: number, targ: number): boolean => {
          if (cand <= 0 || targ <= 0) return false;
          let c = targ;
          const g = new Set<number>();
          while (c > 0 && !g.has(c)) {
            if (c === cand) return true;
            g.add(c);
            const p = snap1.get(c);
            c = p ? p.parentId : 0;
          }
          return false;
        };

        for (const id1 of s1Ids) {
          const sn = snap1.get(id1)!;
          const oKey = sn.owner.toLowerCase();
          s1DirectMap.set(id1, 0);
          s1UnilevelMap.set(id1, 0);

          if (!sn.isClone && !sn.isExtraId) {
            if (!s1OwnerPrimary.has(oKey)) s1OwnerPrimary.set(oKey, id1);
            const list = s1OwnerAllMains.get(oKey) || [];
            list.push(id1);
            s1OwnerAllMains.set(oKey, list);
            s1OriginMainMap.set(id1, id1);
          } else if (sn.isClone) {
            const firstId = s1OwnerPrimary.get(oKey) || id1;
            const onChainOrig = sn.originMainId > 0 && sn.originMainId !== id1 ? sn.originMainId : 0;
            let spawnedFrom = 0;
            for (let lb = id1 - 1; lb >= 1; lb--) {
              const rc = snap1.get(lb);
              if (!rc || rc.parentId <= 0) continue;
              const tp = snap1.get(rc.parentId);
              if (
                tp &&
                tp.rightChild === rc.id &&
                tp.owner.toLowerCase() === oKey &&
                !s1MatchedRight.has(tp.id) &&
                (onChainOrig === 0 || (s1OriginMainMap.get(tp.id) || tp.id) === onChainOrig)
              ) {
                spawnedFrom = tp.id;
                s1MatchedRight.add(tp.id);
                break;
              }
            }
            if (spawnedFrom === 0) {
              if (onChainOrig > 0) {
                spawnedFrom = onChainOrig;
              } else {
                const mains = s1OwnerAllMains.get(oKey) || [];
                const match = [...mains].reverse().find((m) => m < id1 && isAnc1(m, id1));
                spawnedFrom = match || firstId;
              }
            }
            const trigIsClone = Boolean(snap1.get(spawnedFrom)?.isClone);
            const origMain =
              onChainOrig > 0
                ? onChainOrig
                : trigIsClone
                ? s1OriginMainMap.get(spawnedFrom) || firstId
                : spawnedFrom;
            s1OriginMainMap.set(id1, origMain);
            s1CloneCountByMain.set(origMain, (s1CloneCountByMain.get(origMain) || 0) + 1);
          } else {
            const firstId = s1OwnerPrimary.get(oKey) || id1;
            const origMain = sn.originMainId > 0 ? sn.originMainId : firstId;
            s1OriginMainMap.set(id1, origMain);
            s1ExtraCountByMain.set(origMain, (s1ExtraCountByMain.get(origMain) || 0) + 1);
          }
        }

        const resolveSponsor1 = (nodeId: number, sponsorAddr: string): number => {
          if (s1AutoIdSourceMap.has(nodeId)) return s1AutoIdSourceMap.get(nodeId)!;
          const sn = snap1.get(nodeId);
          if (sn && sn.isClone) {
            const orig = s1OriginMainMap.get(nodeId) || nodeId;
            if (orig !== nodeId) {
              if (orig === 1) return 1;
              if (s1AutoIdSourceMap.has(orig)) return s1AutoIdSourceMap.get(orig)!;
              const origNode = snap1.get(orig);
              if (origNode && origNode.directSponsorNodeId > 0) {
                return origNode.directSponsorNodeId;
              }
              const effSponsor =
                origNode && origNode.directSponsor && origNode.directSponsor !== ethers.ZeroAddress
                  ? origNode.directSponsor
                  : sponsorAddr;
              return resolveSponsor1(orig, effSponsor);
            }
          }
          if (sn && sn.directSponsorNodeId > 0) {
            return sn.directSponsorNodeId;
          }
          if (!sponsorAddr || sponsorAddr === ethers.ZeroAddress) return 0;
          const sKey = sponsorAddr.toLowerCase();
          const cands = (s1OwnerAllMains.get(sKey) || []).filter((m) => m < nodeId);
          if (cands.length === 0) return s1OwnerPrimary.get(sKey) || 1;
          if (cands.length === 1) return cands[0];
          let curr = sn?.parentId || 0;
          const vis = new Set<number>();
          while (curr > 0 && !vis.has(curr)) {
            vis.add(curr);
            const anc = snap1.get(curr);
            if (!anc) break;
            if (anc.owner.toLowerCase() === sKey) {
              const ancOrig = s1OriginMainMap.get(anc.id) || anc.id;
              if (ancOrig < nodeId) return ancOrig;
            }
            curr = anc.parentId;
          }
          return cands[0];
        };

        const r1Price = RANK_PRICES_USDT[0] || 5;
        const r1DirectUnit = r1Price * 0.3;
        const r1UnilevelUnit = r1Price * 0.02;
        const r1VaultUnit = r1Price * 0.35;

        for (const id1 of s1Ids) {
          const sn = snap1.get(id1)!;
          const oKey = sn.owner.toLowerCase();
          const firstMain = s1OwnerPrimary.get(oKey) || id1;

          if (!sn.isClone && !sn.isExtraId && id1 > firstMain && !R1_EXPLICIT_MANUAL_IDS.has(id1)) {
            const explicitSpId = sn.directSponsorNodeId || 0;
            // กฎเหล็ก Pool 2: รหัสหลักต้นทาง (m) จะสร้าง New Auto ID ได้ก็ต่อเมื่อพ้นกรอบ 5 rank ย้อนหลังแล้วเท่านั้น (window5Start > 1 คืออยู่ตั้งแต่ Rank 6 ขึ้นไป หรือเป็น Root #1)
            const priorMains = (s1OwnerAllMains.get(oKey) || []).filter((m) => {
              if (m >= id1) return false;
              if (getMainIdWindow5Start(m, sn.owner) <= 1) return false;
              const maxAllowed = crossRankAutoIdCount.get(m) || 0;
              const curSpawns = s1AutoIdCountByMain.get(m) || 0;
              if (curSpawns >= maxAllowed) return false;
              const mSpId = snap1.get(m)?.directSponsorNodeId || 0;
              const isSelfSp = Boolean(sn.directSponsor && sn.directSponsor.toLowerCase() === oKey);
              return (
                (isSelfSp && (explicitSpId === 0 || m === explicitSpId)) ||
                (explicitSpId > 0 && explicitSpId === mSpId)
              );
            });
            let sourceMain = priorMains.find(
              (m) => (s1AutoVaultSim.get(m) || 0) + 1e-9 >= r1Price
            );
            if (sourceMain === undefined) {
              sourceMain = priorMains.find((m) => {
                if (s1UsedExtraR2To3.has(m)) return false;
                const r1Bal = s1AutoVaultSim.get(m) || 0;
                const extraBal = extraVaultFromRanks2To4.get(m) || 0;
                return r1Bal + extraBal + 1e-9 >= r1Price;
              });
              if (sourceMain !== undefined) {
                s1UsedExtraR2To3.add(sourceMain);
                s1AutoVaultSim.set(
                  sourceMain,
                  Number(
                    ((s1AutoVaultSim.get(sourceMain) || 0) + (extraVaultFromRanks2To4.get(sourceMain) || 0)).toFixed(4)
                  )
                );
              }
            }
            if (sourceMain !== undefined) {
              s1AutoIdSourceMap.set(id1, sourceMain);
              s1AutoIdCountByMain.set(sourceMain, (s1AutoIdCountByMain.get(sourceMain) || 0) + 1);
              s1AutoVaultSim.set(
                sourceMain,
                Math.max(0, Number(((s1AutoVaultSim.get(sourceMain) || 0) - r1Price).toFixed(4)))
              );
            }
          }

          if (sn.parentId > 0) {
            const p = snap1.get(sn.parentId);
            if (p && p.leftChild === id1) {
              const isId1Clone = sn.isClone && s1OriginMainMap.get(id1) === 1;
              const hasSponsor = Boolean(sn.directSponsor && sn.directSponsor !== ethers.ZeroAddress);
              if (isId1Clone || !hasSponsor) {
                const tLin = s1OriginMainMap.get(id1) || 1;
                s1FamilyDirectMap.set(tLin, Number(((s1FamilyDirectMap.get(tLin) || 0) + r1DirectUnit).toFixed(4)));
              } else {
                const spNodeId = resolveSponsor1(id1, sn.directSponsor);
                if (spNodeId > 0) {
                  s1DirectMap.set(spNodeId, Number(((s1DirectMap.get(spNodeId) || 0) + r1DirectUnit).toFixed(4)));
                }
              }

              let upId = sn.parentId;
              for (let t = 1; t <= 15 && upId > 0; t++) {
                s1UnilevelMap.set(upId, Number(((s1UnilevelMap.get(upId) || 0) + r1UnilevelUnit).toFixed(4)));
                const upNode = snap1.get(upId);
                upId = upNode ? upNode.parentId : 0;
              }

              const pMain = s1OriginMainMap.get(p.id) || p.id;
              s1GrossVaultMap.set(pMain, Number(((s1GrossVaultMap.get(pMain) || 0) + r1VaultUnit).toFixed(4)));
              // เฉพาะรหัสหลักที่ Rank 1 พ้นกรอบ 5 rank ย้อนหลังแล้วเท่านั้น (1 < window5Start) จึงจะสะสมเข้า New Auto ID Pool
              const pMainWindow5Start = getMainIdWindow5Start(pMain, p.owner);
              if (!sn.isExtraId && 1 < pMainWindow5Start) {
                s1AutoVaultSim.set(pMain, Number(((s1AutoVaultSim.get(pMain) || 0) + r1VaultUnit).toFixed(4)));
              }
            }
          }
        }

        for (const id1 of s1Ids) {
          const sn = snap1.get(id1)!;
          if (sn.isClone || sn.isExtraId) continue;
          let sumDir = 0;
          let sumUni = 0;
          for (const otherId of s1Ids) {
            if ((s1OriginMainMap.get(otherId) || otherId) === id1) {
              sumDir += s1DirectMap.get(otherId) || 0;
              sumUni += s1UnilevelMap.get(otherId) || 0;
            }
          }
          const crossSpawn = crossRankAutoIdCount.get(id1);
          const autoCount =
            crossSpawn !== undefined && crossSpawn > 0
              ? crossSpawn
              : s1AutoIdCountByMain.get(id1) || 0;

          const crossExtra = crossRankExtraIdCount.get(id1);
          const extraCount =
            crossExtra !== undefined
              ? crossExtra
              : s1ExtraCountByMain.get(id1) || 0;

          const extraLeftDirect = crossRankExtraLeftDirectBonusMap.get(id1) || 0;
          const extraLeftLevel = crossRankExtraLeftLevelBonusMap.get(id1) || 0;
          const extraLeftVault = crossRankExtraLeftVaultMap.get(id1) || 0;

          unifiedSummaryByR1Main.set(id1, {
            directRewardAllNodes: Number((sumDir + extraLeftDirect).toFixed(4)),
            unilevelRewardAllNodes: Number((sumUni + extraLeftLevel).toFixed(4)),
            totalClonesCount: s1CloneCountByMain.get(id1) || 0,
            totalAutoIdCount: autoCount,
            totalExtraIdCount: extraCount,
            familyPoolDirectFromLineage: s1FamilyDirectMap.get(id1) || 0,
            grossVaultFromLineage: Number(((s1GrossVaultMap.get(id1) || 0) + extraLeftVault).toFixed(4)),
          });
        }
      }

      // Pass 3: Build EnrichedBinaryNode map
      const enrichedMap = new Map<number, EnrichedBinaryNode>();
      for (const id of sortedIds) {
        const n = rawNodes.get(id)!;
        const originMainId = originMainIdMap.get(n.id) || n.id;
        const spawnedFromNodeId = spawnedFromMap.get(n.id) || 0;
        const cloneRound = cloneRoundMap.get(n.id) || 0;
        const subCloneDepth = subCloneDepthMap.get(n.id) || 0;

        let depth = 1;
        let currP = n.parentId;
        const visited = new Set<number>();
        while (currP > 0 && !visited.has(currP)) {
          visited.add(currP);
          depth++;
          const pObj = rawNodes.get(currP);
          currP = pObj ? pObj.parentId : 0;
        }

        let isLeft = true;
        if (n.parentId > 0) {
          const pObj = rawNodes.get(n.parentId);
          if (pObj && pObj.rightChild === n.id) {
            isLeft = false;
          }
        }

        // Map local `originMainId` in `activeRank` to its primary Rank 1 Main ID (`r1MainId`) first
        const originNodeInActive = rawNodes.get(originMainId);
        const isExtraOrigin = Boolean(n.isExtraId || originNodeInActive?.isExtraId);
        const extraMainLabel = isExtraOrigin
          ? `Extra R${activeRank}-#${originMainId}`
          : undefined;
        let r1MainId: number | undefined = isExtraOrigin ? undefined : originMainId;
        if (activeRank > 1 && !isExtraOrigin) {
          if (originMainId === 1) {
            r1MainId = 1;
          } else {
            const directOnChainR1 = onChainOriginMap.get(originMainId) || onChainOriginMap.get(n.id) || 0;
            if (directOnChainR1 > 0) {
              r1MainId = directOnChainR1;
            } else {
              const mappedR1 = getCorrespondingMainIdInRank(activeRank, originMainId, n.owner, 1);
              if (mappedR1 > 0) {
                r1MainId = mappedR1;
              }
            }
          }
        }

        let directUplineNodeId = 0;
        const isRootMainItself = n.id === 1 && !n.isClone && !n.isExtraId;
        const isRootClone =
          n.isClone && !isExtraOrigin && (r1MainId === 1 || originMainId === 1);

        if (isRootMainItself || isRootClone) {
          directUplineNodeId = 0;
        } else if (autoIdSourceMainMap.has(n.id)) {
          directUplineNodeId = autoIdSourceMainMap.get(n.id)!;
        } else if (n.isExtraId || extraIdSourceMainMap.has(n.id)) {
          const rawExtraSp =
            extraIdSourceMainMap.get(n.id) ||
            onChainSponsorNodeMap.get(n.id) ||
            resolveSponsorNodeIdForNode(n.id, n.directSponsor) ||
            1;
          const extraSpR1 =
            activeRank === 1
              ? rawExtraSp
              : onChainOriginMap.get(rawExtraSp) ||
                getCorrespondingMainIdInRank(
                  activeRank,
                  rawExtraSp,
                  n.directSponsor || n.owner,
                  1
                ) ||
                rawExtraSp;
          directUplineNodeId = extraSpR1 > 0 ? extraSpR1 : 1;
        } else if (n.isClone) {
          const originEnriched = enrichedMap.get(originMainId);
          if (originEnriched && originEnriched.directUplineNodeId > 0) {
            directUplineNodeId = originEnriched.directUplineNodeId;
          } else if (autoIdSourceMainMap.has(originMainId)) {
            directUplineNodeId = autoIdSourceMainMap.get(originMainId)!;
          } else if (extraIdSourceMainMap.has(originMainId)) {
            const rawExtraSp = extraIdSourceMainMap.get(originMainId)!;
            directUplineNodeId =
              activeRank === 1
                ? rawExtraSp
                : onChainOriginMap.get(rawExtraSp) ||
                  getCorrespondingMainIdInRank(
                    activeRank,
                    rawExtraSp,
                    n.directSponsor || n.owner,
                    1
                  ) ||
                  rawExtraSp;
          } else {
            directUplineNodeId = resolveSponsorNodeIdForNode(n.id, n.directSponsor);
          }
        } else if (activeRank > 1 && !n.isExtraId) {
          // ผู้แนะนำใน Rank 2-27 ยึดตามผู้แนะนำเดิมของรหัสหลักนั้นจาก Rank 1 เสมอ
          let r1FoundSponsor = 0;
          if (snap1) {
            const userR1 =
              (r1MainId ? snap1.get(r1MainId) : undefined) ||
              Array.from(snap1.values()).find(
                (sn) =>
                  sn.owner.toLowerCase() === n.owner.toLowerCase() &&
                  !sn.isClone &&
                  !sn.isExtraId &&
                  (n.id === 1 || sn.id > 1)
              );
            if (userR1) {
              if (userR1.directSponsorNodeId && userR1.directSponsorNodeId > 0) {
                r1FoundSponsor = userR1.directSponsorNodeId;
              } else if (userR1.directSponsor && userR1.directSponsor !== ethers.ZeroAddress) {
                const spR1 = Array.from(snap1.values()).find(
                  (sn) =>
                    sn.owner.toLowerCase() === userR1.directSponsor.toLowerCase() &&
                    !sn.isClone &&
                    !sn.isExtraId
                );
                if (spR1) r1FoundSponsor = spR1.id;
              }
            }
          }
          if (r1FoundSponsor > 0) {
            directUplineNodeId = r1FoundSponsor;
          } else {
            directUplineNodeId = resolveSponsorNodeIdForNode(n.id, n.directSponsor);
          }
        } else if (n.directSponsor && n.directSponsor !== ethers.ZeroAddress) {
          directUplineNodeId = resolveSponsorNodeIdForNode(n.id, n.directSponsor);
        }

        const hasLeftChild = n.leftChild > 0;
        const vaultBalance = hasLeftChild ? vaultUnit : 0;

        // สถานะรหัสหลัก (MANUAL ID vs AUTO ID) ต้องยึดตามรหัสหลักใน Rank 1 (`r1MainId`) เสมอ ไม่ใช่เลขลำดับโหนดใน Rank 2-27 (`n.id`)
        const effectiveR1MainId = isExtraOrigin
          ? 0
          : r1MainId || (activeRank === 1 ? n.id : originMainId);

        enrichedMap.set(n.id, {
          id: n.id,
          rank: activeRank,
          level: depth,
          parentId: n.parentId,
          isLeft,
          owner: n.owner,
          directSponsor: n.directSponsor,
          leftChild: n.leftChild,
          rightChild: n.rightChild,
          isClone: n.isClone,
          isExtraId: n.isExtraId,
          isAutoMainId:
            !n.isClone &&
            !n.isExtraId &&
            effectiveR1MainId > 0 &&
            (R1_EXPLICIT_AUTO_IDS.has(effectiveR1MainId) ||
              s1AutoIdSourceMap.has(effectiveR1MainId) ||
              (activeRank === 1 && autoMainNodeIds.has(n.id))) &&
            !R1_EXPLICIT_MANUAL_IDS.has(effectiveR1MainId),
          originMainId,
          r1MainId,
          isExtraLineage: isExtraOrigin,
          extraMainLabel,
          spawnedFromNodeId,
          cloneRound,
          subCloneDepth,
          spawnedCloneIds: nodeSpawnedClones.get(n.id) || [],
          directUplineNodeId,
          directRewardThisNode: nodeDirectBonusMap.get(n.id) || 0,
          unilevelRewardThisNode: nodeUnilevelBonusMap.get(n.id) || 0,
          directRewardAllNodes: 0,
          unilevelRewardAllNodes: 0,
          upgradeRankPool: 0,
          newAutoIdPool: 0,
          newExtraIdPool: 0,
          totalClonesCount: 0,
          totalAutoIdCount: 0,
          totalExtraIdCount: 0,
          vaultBalance,
          nextRankPrice: nextPrice,
          familyPoolDirectFromLineage: 0,
          grossVaultFromLineage: 0,
        });
      }

      // เงินแยกของใครของมัน: ข้อมูลสะสมรหัสหลัก (Box 2) คำนวณแยกอิสระรายรหัสหลัก (ทั้ง Manual ID, Auto ID และ Extra ID)
      for (const node of enrichedMap.values()) {
        const isExtraLineage = Boolean(
          node.isExtraId || rawNodes.get(node.originMainId)?.isExtraId
        );
        const targetMainId = isExtraLineage
          ? node.originMainId
          : node.r1MainId || node.originMainId;
        const unified = isExtraLineage ? undefined : unifiedSummaryByR1Main.get(targetMainId);

        if (unified) {
          node.directRewardAllNodes = unified.directRewardAllNodes;
          node.unilevelRewardAllNodes = unified.unilevelRewardAllNodes;
          node.totalClonesCount = nodeCloneRoundCount.get(node.originMainId) || 0;
          node.totalAutoIdCount = unified.totalAutoIdCount;
          node.totalExtraIdCount =
            crossRankExtraIdCount.get(targetMainId) ?? unified.totalExtraIdCount;
          node.familyPoolDirectFromLineage = unified.familyPoolDirectFromLineage;
          node.grossVaultFromLineage = unified.grossVaultFromLineage;
        } else {
          let sumDirect = 0;
          let sumUnilevel = 0;
          for (const other of enrichedMap.values()) {
            const otherIsExtra = Boolean(
              other.isExtraId || rawNodes.get(other.originMainId)?.isExtraId
            );
            const otherMainId = otherIsExtra
              ? other.originMainId
              : other.r1MainId || other.originMainId;
            if (otherIsExtra === isExtraLineage && otherMainId === targetMainId) {
              sumDirect += other.directRewardThisNode;
              sumUnilevel += other.unilevelRewardThisNode;
            }
          }
          node.directRewardAllNodes = Number(sumDirect.toFixed(4));
          node.unilevelRewardAllNodes = Number(sumUnilevel.toFixed(4));
          node.totalClonesCount = nodeCloneRoundCount.get(node.originMainId) || 0;
          node.totalAutoIdCount = isExtraLineage
            ? 0
            : mainNodeAutoIdSpawnCount.get(node.originMainId) || 0;
          node.totalExtraIdCount = isExtraLineage
            ? lineageExtraIdSpawnCount.get(node.originMainId) || 0
            : crossRankExtraIdCount.get(targetMainId) ??
              (lineageExtraIdSpawnCount.get(node.originMainId) || 0);
          node.familyPoolDirectFromLineage = lineageFamilyPoolDirectMap.get(node.originMainId) || 0;
          node.grossVaultFromLineage = lineageGrossVaultMap.get(node.originMainId) || 0;
        }

        // คำนวณสถานะ Rank ปัจจุบันของ Idหลักนั้นๆ (Extra ID แยกสถานะ Rank และกระเป๋า Vault ของตัวเองอิสระเหมือน Auto ID)
        const mainIdCurrentRank = isExtraLineage
          ? activeRank
          : getMainIdCurrentRank(targetMainId, node.owner);

        // รวบรวมยอดสะสม Vault (35%) ในแต่ละ Rank สำหรับ Idหลักนั้นๆ
        const mainVaultByRank: Record<number, number> = {};
        if (!isExtraLineage) {
          for (let r = 1; r <= 27; r++) {
            const snap = multiRankSnapshots.get(r);
            if (snap) {
              const corresp = getCorrespondingMainIdInRank(1, targetMainId, node.owner, r);
              if (corresp > 0 && snap.has(corresp)) {
                mainVaultByRank[r] = snap.get(corresp)?.nodeVault ?? 0;
              }
            }
          }
        }

        // คำนวณ 3 Pools (สำหรับ EXTRA ID: Vault 35% จากเม็ดซ้ายถูกส่งกลับไปที่ New Extra ID Pool ของ directSponsor):
        const poolMainKey = isExtraLineage
          ? activeRank * 1000000 + node.originMainId
          : targetMainId;
        const pools = calculateMainIdVaultPools(
          poolMainKey,
          mainIdCurrentRank,
          mainVaultByRank
        );

        const extraLeftVaultForSponsor = isExtraLineage
          ? 0
          : crossRankExtraLeftVaultMap.get(targetMainId) || 0;

        node.upgradeRankPool = isExtraLineage ? 0 : pools.upgradeRankPool;
        node.newAutoIdPool = isExtraLineage ? 0 : pools.newAutoIdPool;
        node.newExtraIdPool = isExtraLineage
          ? 0
          : Number((pools.newExtraIdPool + extraLeftVaultForSponsor).toFixed(4));
        node.targetMainIdCurrentRank = pools.currentRank;
        node.window5Start = pools.window5Start;
        node.window5End = pools.window5End;
        node.window5DescriptionTh = pools.windowDescriptionTh;

        node.grossVault1To4FromLineage = isExtraLineage
          ? node.grossVaultFromLineage
          : crossRankGrossVault1To4.get(targetMainId) || node.grossVaultFromLineage;
        node.thisRankRemainingVault = mainVaultByRank[activeRank] ?? node.newAutoIdPool;
        node.vault1To4BreakdownText = isExtraLineage
          ? undefined
          : crossRankBreakdownText.get(targetMainId);
        node.vault4To27BreakdownText = isExtraLineage
          ? undefined
          : crossRankExtraBreakdownText.get(targetMainId);
      }

        // Detect newly arrived node IDs in this rank (e.g. when ID #6+ joins) so we can highlight & auto-extend the tree
        const prevKnownSet = knownNodeIdsByRankRef.current.get(activeRank);
        const currentIdsSet = new Set<number>(enrichedMap.keys());

        if (prevKnownSet && prevKnownSet.size > 0) {
          const newIds = Array.from(currentIdsSet)
            .filter((nid) => !prevKnownSet.has(nid))
            .sort((a, b) => a - b);

          if (newIds.length > 0) {
            setNewlyAddedNodeIds((prev) => {
              const next = new Set(prev);
              newIds.forEach((id) => next.add(id));
              return next;
            });

            const newestId = newIds[newIds.length - 1];
            const newestNode = enrichedMap.get(newestId);
            if (newestNode) {
              setLatestNewNodeAlert({
                id: newestNode.id,
                originMainId: newestNode.r1MainId || newestNode.originMainId,
                parentId: newestNode.parentId,
                isLeft: newestNode.isLeft,
                level: newestNode.level,
                isClone: newestNode.isClone,
                addedCount: newIds.length,
                timestamp: new Date().toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              });
              setJustUpdatedBadge(true);
              setTimeout(() => setJustUpdatedBadge(false), 8000);
            }
          }
        }

        knownNodeIdsByRankRef.current.set(activeRank, currentIdsSet);
        setOnChainNodesMap(enrichedMap);
        setLastSyncTime(
          new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } catch (err) {
        console.error('Error loading on-chain binary tree:', err);
      } finally {
        setIsLoadingTree(false);
        setIsLiveSyncing(false);
      }
    },
    [getWorkingProvider, selectedRank, contractAddress]
  );

  useEffect(() => {
    loadOnChainTree(selectedRank);
  }, [loadOnChainTree, selectedRank]);

  // Real-Time Polling Effect (Checks and appends new nodes automatically every N seconds without flickering)
  useEffect(() => {
    if (!isRealtimeActive || viewMode !== 'onchain') return;

    const timer = setInterval(() => {
      setRealtimeCountdown((prev) => {
        if (prev <= 1) {
          loadOnChainTree(selectedRank, { silent: true });
          return realtimeInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRealtimeActive, realtimeInterval, viewMode, selectedRank, loadOnChainTree]);

  // 1. Auto-refresh tree when registration or batch registration succeeds
  useEffect(() => {
    if (lastTxSuccess || refreshTrigger) {
      loadOnChainTree(selectedRank, { silent: onChainNodesMap.size > 0, forceSync: true });
      setViewMode('onchain');
      setJustUpdatedBadge(true);
      const timer = setTimeout(() => setJustUpdatedBadge(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [lastTxSuccess, refreshTrigger, selectedRank, onChainNodesMap.size, loadOnChainTree]);

  // 2. Global event listener dispatched whenever user registers, upgrades, or activates nodes
  useEffect(() => {
    const handleGlobalTreeRefresh = () => {
      loadOnChainTree(selectedRank, { silent: true, forceSync: true });
      setViewMode('onchain');
      setJustUpdatedBadge(true);
      setTimeout(() => setJustUpdatedBadge(false), 6000);
    };

    window.addEventListener('matrix:tree:refresh', handleGlobalTreeRefresh);
    return () => {
      window.removeEventListener('matrix:tree:refresh', handleGlobalTreeRefresh);
    };
  }, [loadOnChainTree, selectedRank]);

  // Active nodes map based on viewMode ('onchain' or 'demoCloneTree')
  const activeNodesMap = useMemo(() => {
    if (viewMode === 'demoCloneTree') {
      return buildScreenshotPreviewNodes(selectedRank);
    }
    // In onchain mode, return real on-chain nodes (never glitch or replace with mock demo nodes)
    return onChainNodesMap;
  }, [viewMode, onChainNodesMap, selectedRank]);

  // Identify the highest/latest Node in the current rank and the deepest level in the tree
  const { latestNodeInRank, maxTreeLevelInRank } = useMemo(() => {
    let maxId = 0;
    let maxLvl = 1;
    let latestNode: EnrichedBinaryNode | null = null;
    for (const n of activeNodesMap.values()) {
      if (n.id > maxId) {
        maxId = n.id;
        latestNode = n;
      }
      if (n.level > maxLvl) {
        maxLvl = n.level;
      }
    }
    return { latestNodeInRank: latestNode, maxTreeLevelInRank: maxLvl };
  }, [activeNodesMap]);

  // If autoFollowNewNodes is enabled and a new node arrives that is NOT inside the currently focused subtree, ensure focusRootId shows it
  useEffect(() => {
    if (!autoFollowNewNodes || !latestNewNodeAlert || viewMode !== 'onchain') return;
    const newId = latestNewNodeAlert.id;
    if (!activeNodesMap.has(newId)) return;

    // Check if newId is a descendant of current focusRootId
    let curr = newId;
    let isDescendantOfFocus = false;
    const guard = new Set<number>();
    while (curr > 0 && !guard.has(curr)) {
      if (curr === focusRootId) {
        isDescendantOfFocus = true;
        break;
      }
      guard.add(curr);
      const p = activeNodesMap.get(curr);
      curr = p ? p.parentId : 0;
    }

    if (!isDescendantOfFocus) {
      setFocusRootId(1);
      setNavigationHistory([1]);
      setSearchInput('1');
    }
  }, [latestNewNodeAlert, autoFollowNewNodes, viewMode, activeNodesMap, focusRootId]);

  // Recalculate exact SVG connector lines between every Parent and its Left/Right children
  const recalculateTreeConnectors = useCallback(() => {
    const containerEl = treeContentRef.current;
    if (!containerEl) return;

    const containerRect = containerEl.getBoundingClientRect();
    const scale = zoomScale || 1;

    const newLines: ConnectorLine[] = [];
    const parentEls = containerEl.querySelectorAll<HTMLElement>('[data-node-anchor]');

    parentEls.forEach((parentEl) => {
      const parentIdStr = parentEl.getAttribute('data-node-anchor');
      if (!parentIdStr) return;
      const parentId = Number(parentIdStr);
      const parentNode = activeNodesMap.get(parentId);
      if (!parentNode) return;

      const pRect = parentEl.getBoundingClientRect();
      const x1 = (pRect.left - containerRect.left + pRect.width / 2) / scale;
      const y1 = (pRect.bottom - containerRect.top) / scale;

      const leftTargetEl =
        parentNode.leftChild > 0
          ? containerEl.querySelector<HTMLElement>(`[data-node-card="${parentNode.leftChild}"]`)
          : containerEl.querySelector<HTMLElement>(`[data-empty-slot="${parentId}-left"]`);

      if (leftTargetEl) {
        const lRect = leftTargetEl.getBoundingClientRect();
        const x2 = (lRect.left - containerRect.left + lRect.width / 2) / scale;
        const y2 = (lRect.top - containerRect.top) / scale;
        newLines.push({
          key: `line-${parentId}-left`,
          x1,
          y1,
          x2,
          y2,
          isLeft: true,
          isFilled: parentNode.leftChild > 0,
        });
      }

      const rightTargetEl =
        parentNode.rightChild > 0
          ? containerEl.querySelector<HTMLElement>(`[data-node-card="${parentNode.rightChild}"]`)
          : containerEl.querySelector<HTMLElement>(`[data-empty-slot="${parentId}-right"]`);

      if (rightTargetEl) {
        const rRect = rightTargetEl.getBoundingClientRect();
        const x2 = (rRect.left - containerRect.left + rRect.width / 2) / scale;
        const y2 = (rRect.top - containerRect.top) / scale;
        newLines.push({
          key: `line-${parentId}-right`,
          x1,
          y1,
          x2,
          y2,
          isLeft: false,
          isFilled: parentNode.rightChild > 0,
        });
      }
    });

    setConnectorLines(newLines);
  }, [activeNodesMap, zoomScale]);

  // Reset horizontal scroll position to center Root Node whenever rank, viewMode, or focusRootId changes
  useLayoutEffect(() => {
    const viewportEl = scrollViewportRef.current;
    if (!viewportEl) return;
    const centerScroll = () => {
      const maxScrollLeft = Math.max(0, viewportEl.scrollWidth - viewportEl.clientWidth);
      viewportEl.scrollLeft = maxScrollLeft > 0 ? Math.floor(maxScrollLeft / 2) : 0;
    };
    centerScroll();
    const timer = setTimeout(centerScroll, 50);
    return () => clearTimeout(timer);
  }, [selectedRank, viewMode, focusRootId]);

  useLayoutEffect(() => {
    recalculateTreeConnectors();
    const timer = setTimeout(recalculateTreeConnectors, 60);
    return () => clearTimeout(timer);
  }, [
    recalculateTreeConnectors,
    focusRootId,
    expandedBenefitNodeId,
    viewMode,
    selectedRank,
    zoomScale,
    activeNodesMap.size,
    maxRenderDepth,
  ]);

  useEffect(() => {
    const containerEl = treeContentRef.current;
    if (!containerEl || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      recalculateTreeConnectors();
    });
    observer.observe(containerEl);
    window.addEventListener('resize', recalculateTreeConnectors);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recalculateTreeConnectors);
    };
  }, [recalculateTreeConnectors]);

  const handleAutoFitScreen = useCallback(() => {
    const viewportEl = scrollViewportRef.current;
    const contentEl = treeContentRef.current;
    if (!viewportEl || !contentEl) return;

    const availableWidth = viewportEl.clientWidth - 24;
    const naturalWidth = contentEl.scrollWidth || 1;
    if (naturalWidth <= availableWidth) {
      setZoomScale(1);
    } else {
      const ratio = Math.max(0.55, Math.min(1, Number((availableWidth / naturalWidth).toFixed(2))));
      setZoomScale(ratio);
    }
  }, []);

  const navigateToNode = (targetId: number) => {
    let resolvedNodeId = targetId;
    if (!activeNodesMap.has(resolvedNodeId)) {
      const foundByMain = Array.from(activeNodesMap.values()).find(
        (n) => (!n.isExtraLineage && n.r1MainId === targetId) || n.originMainId === targetId
      );
      if (foundByMain) {
        resolvedNodeId = foundByMain.id;
      } else {
        return;
      }
    }
    setFocusRootId(resolvedNodeId);
    setSearchInput(String(targetId));
    setNavigationHistory((prev) => {
      if (prev[prev.length - 1] === resolvedNodeId) return prev;
      return [...prev, resolvedNodeId];
    });
  };

  const handleGoBack = () => {
    if (navigationHistory.length > 1) {
      const nextHist = navigationHistory.slice(0, -1);
      const prevId = nextHist[nextHist.length - 1];
      setNavigationHistory(nextHist);
      setFocusRootId(prevId);
      setSearchInput(String(prevId));
    } else {
      const currentRoot = activeNodesMap.get(focusRootId);
      if (currentRoot && currentRoot.parentId > 0) {
        navigateToNode(currentRoot.parentId);
      } else {
        navigateToNode(1);
      }
    }
  };

  const breadcrumbPath = useMemo(() => {
    const path: number[] = [];
    let curr = focusRootId;
    const visited = new Set<number>();
    while (curr > 0 && !visited.has(curr)) {
      visited.add(curr);
      path.unshift(curr);
      const node = activeNodesMap.get(curr);
      if (!node || node.parentId === 0) break;
      curr = node.parentId;
    }
    return path.length > 0 ? path : [1];
  }, [focusRootId, activeNodesMap]);

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1800);
  };

  // Render an Empty Slot card (ว่าง (ซ้าย) / ว่าง (ขวา))
  const renderEmptySlotCard = (parentNode: EnrichedBinaryNode, isLeftSlot: boolean) => {
    const sponsorIdToUse = parentNode.originMainId || parentNode.id || 1;
    const slotKey = `${parentNode.id}-${isLeftSlot ? 'left' : 'right'}`;

    return (
      <div
        data-empty-slot={slotKey}
        className="w-[100px] sm:w-[118px] h-auto rounded-xl border border-dashed border-purple-500/45 bg-[#121629]/95 p-1.5 sm:p-2 flex flex-col items-center justify-center gap-1 shadow-lg relative z-10"
      >
        <span className="text-[10px] font-semibold text-slate-400">
          {isLeftSlot
            ? language === 'th'
              ? 'ว่าง (ซ้าย)'
              : 'Empty (Left)'
            : language === 'th'
            ? 'ว่าง (ขวา)'
            : 'Empty (Right)'}
        </span>
        <button
          type="button"
          onClick={() => openRegisterModal(sponsorIdToUse, parentNode.id, isLeftSlot)}
          className={`w-full py-1 px-1.5 rounded-lg font-bold text-[9px] text-white shadow-md transition flex items-center justify-center gap-1 cursor-pointer ${
            isLeftSlot
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-emerald-950/50'
              : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 shadow-purple-950/50'
          }`}
        >
          <Sparkles className="w-2.5 h-2.5 shrink-0" />
          <span>
            {isLeftSlot
              ? language === 'th'
                ? '+ ลงรหัสซ้าย'
                : '+ Place Left'
              : language === 'th'
              ? '+ ลงรหัสขวา'
              : '+ Place Right'}
          </span>
        </button>
      </div>
    );
  };

  // Render a single Node Card matching the exact Normal ID & Clone ID layouts
  const renderNodeCard = (node: EnrichedBinaryNode) => {
    const leftChildNode = node.leftChild > 0 ? activeNodesMap.get(node.leftChild) : undefined;
    const rightChildNode = node.rightChild > 0 ? activeNodesMap.get(node.rightChild) : undefined;
    const isMyNode =
      Boolean(userAddress) && node.owner.toLowerCase() === userAddress!.toLowerCase();
    const isBenefitOpen = expandedBenefitNodeId === node.id;
    const isNewlyAppended = newlyAddedNodeIds.has(node.id);
    const isLatestInRank = Boolean(latestNodeInRank && node.id > 1 && node.id === latestNodeInRank.id);

    const formatChildLabel = (child?: EnrichedBinaryNode, fallbackId?: number) => {
      if (!child && (!fallbackId || fallbackId === 0)) return '';
      if (!child) return `#${fallbackId}(#${fallbackId})`;
      if (child.isExtraId) {
        return `Extra#${child.id}(R${child.rank}-#${child.id})`;
      }
      if (child.isClone && child.isExtraLineage) {
        return `Extra#${child.originMainId}(โคลน#${child.id})`;
      }
      const mainLabel = child.r1MainId || child.originMainId;
      if (child.isClone) {
        return `#${mainLabel}(โคลน#${child.id})`;
      }
      return `#${mainLabel}(#${child.id})`;
    };

    const borderStyle = isNewlyAppended
      ? 'border-amber-400 shadow-[0_4px_16px_rgba(2,6,23,0.85)]'
      : isLatestInRank
      ? 'border-emerald-400/90 shadow-[0_0_22px_rgba(52,211,153,0.75),0_0_10px_rgba(16,185,129,0.85)] ring-2 ring-emerald-400/60'
      : node.isClone
      ? 'border-emerald-400/90 shadow-[0_0_16px_rgba(16,185,129,0.25)]'
      : node.isExtraId
      ? 'border-rose-500/80 shadow-[0_0_14px_rgba(244,63,94,0.2)]'
      : node.isAutoMainId
      ? 'border-amber-400/90 shadow-[0_0_16px_rgba(245,158,11,0.3)] ring-1 ring-amber-400/40'
      : 'border-slate-600/80 shadow-[0_4px_16px_rgba(2,6,23,0.85)]';

    return (
      <div
        data-node-anchor={node.id}
        className="flex flex-col items-center h-auto w-auto relative z-10"
      >
        {/* Main Node Card (Reduced width & 30% reduced vertical length) */}
        <div
          data-node-card={node.id}
          className={`relative w-[156px] sm:w-[172px] md:w-[180px] h-auto rounded-xl bg-[#131829] border-2 ${borderStyle} p-1.5 sm:p-2 text-left transition-all duration-200 hover:border-indigo-400/80 select-none`}
        >
          {/* Top-Left Floating Badges: ✨ มาใหม่ & 🟢 ล่าสุด */}
          <div className="absolute -top-2.5 left-1.5 flex items-center gap-1 z-20">
            {isNewlyAppended && (
              <div className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-bold text-[8.5px] border border-amber-300 flex items-center gap-0.5 shrink-0">
                <Sparkles className="w-2.5 h-2.5 text-slate-950" />
                <span>✨ มาใหม่</span>
              </div>
            )}

            {isLatestInRank && (
              <div className="px-1.5 py-0.2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 text-slate-950 font-black text-[8.5px] border border-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.9)] flex items-center gap-0.5 shrink-0">
                <span>🟢 ล่าสุด</span>
              </div>
            )}
          </div>

          {/* Top-Right Floating Pill Badge */}
          {node.isClone ? (
            <div className="absolute -top-2 right-1.5 px-1.5 py-0.2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-[8.5px] font-black text-slate-950 shadow flex items-center gap-0.5 border border-emerald-200/50">
              <Dna className="w-2.5 h-2.5 text-slate-950" />
              <span>CLONE ID</span>
            </div>
          ) : (
            <div
              className={`absolute -top-2 right-1.5 px-1.5 py-0.2 rounded-full text-[8.5px] font-black shadow flex items-center gap-0.5 ${
                node.isExtraId
                  ? 'bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 text-slate-950 border border-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : node.isAutoMainId
                  ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 border border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 text-white border border-purple-300/40'
              }`}
            >
              <span>
                {node.isExtraId
                  ? 'EXTRA ID'
                  : node.isAutoMainId
                  ? 'AUTO ID'
                  : 'MANUAL ID'}
              </span>
            </div>
          )}

          {/* Header Section */}
          {node.isClone ? (
            <div className="flex items-center justify-between gap-1 pb-1 border-b border-slate-800/90 pt-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => navigateToNode(node.id)}
                  className="px-1.5 py-0.2 rounded bg-[#0d2324] border border-emerald-500/50 font-mono font-extrabold text-[10px] hover:border-emerald-300 transition cursor-pointer"
                  title={
                    node.isExtraLineage
                      ? `รหัสหลักอิสระ ${node.extraMainLabel} (โคลนโหนด #${node.id} ใน Rank ${node.rank})`
                      : `รหัสหลัก #${node.r1MainId || node.originMainId} (โคลนโหนด #${node.id} ใน Rank ${node.rank})`
                  }
                >
                  <span className={node.isExtraLineage ? 'text-cyan-300 font-black' : 'text-amber-400 font-black'}>
                    {node.isExtraLineage
                      ? node.extraMainLabel || `Extra R${node.rank}-#${node.originMainId}`
                      : `Main #${node.r1MainId || node.originMainId}`}
                  </span>{' '}
                  <span className="text-emerald-300 font-bold">(โคลน R{node.rank}-#{node.id})</span>
                </button>
                <span className="px-1 py-0.2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 font-mono font-bold text-[9.5px]">
                  R{node.rank}
                </span>
              </div>

              <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-[9.5px] text-slate-200 font-semibold shrink-0">
                ชั้น {node.level}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1 pb-1 border-b border-slate-800/90 pt-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => navigateToNode(node.id)}
                  className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700/90 font-mono font-extrabold text-[10px] hover:border-amber-400 transition cursor-pointer"
                  title={
                    node.isExtraId
                      ? `รหัสหลักอิสระ ${node.extraMainLabel || `Extra R${node.rank}-#${node.id}`} (แยกอิสระ ไม่ซ้ำกับ Rank 1)`
                      : node.rank > 1 && node.r1MainId
                      ? `รหัสหลักใน Rank 1 คือ #${node.r1MainId} (ลำดับโหนดใน Rank ${node.rank} คือ #${node.id})`
                      : `รหัสหลัก #${node.originMainId}`
                  }
                >
                  {node.isExtraId ? (
                    <>
                      <span className="text-cyan-300 font-black">
                        {node.extraMainLabel || `Extra R${node.rank}-#${node.id}`}
                      </span>{' '}
                      <span className="text-slate-300 font-semibold">
                        (R{node.rank}-#{node.id})
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-amber-400 font-black">
                        Main #{node.r1MainId || node.originMainId}
                      </span>{' '}
                      <span className="text-slate-300 font-semibold">
                        (R{node.rank}-#{node.id})
                      </span>
                    </>
                  )}
                </button>
                <span className="px-1 py-0.2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 font-mono font-bold text-[9.5px]">
                  R{node.rank}
                </span>
              </div>

              <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-[9.5px] text-slate-200 font-semibold shrink-0">
                ชั้น {node.level}
              </span>
            </div>
          )}

          {/* Wallet Row */}
          <div className="mt-1 flex items-center justify-between text-[9.5px] text-white font-mono px-0.5">
            <div className="flex items-center gap-1 truncate">
              <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              <span className="font-bold truncate">Wallet {shortenWallet(node.owner)}</span>
            </div>
            <div className="flex items-center gap-0.5">
              {isMyNode && (
                <span className="text-[7.5px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  คุณ
                </span>
              )}
              <button
                type="button"
                onClick={() => copyAddress(node.owner)}
                className="text-slate-500 hover:text-white transition cursor-pointer"
                title={node.owner}
              >
                {copiedText === node.owner ? (
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </div>
          </div>

          {/* Info Box: Upline & Sponsor */}
          <div className="mt-1 rounded-md bg-[#0c1020] border border-slate-800/90 p-1 px-1.5 space-y-0.5 text-[9px]">
            {node.isExtraId ? (
              <div className="flex items-center justify-between pb-0.5 border-b border-slate-800">
                <span className="text-cyan-300 font-bold text-[8.5px]">รหัสหลักอิสระ:</span>
                <span className="font-mono font-extrabold text-cyan-300 text-[9px]">
                  {node.extraMainLabel || `Extra R${node.rank}-#${node.id}`}
                </span>
              </div>
            ) : (
              node.rank > 1 &&
              !node.isClone &&
              node.r1MainId && (
                <div className="flex items-center justify-between pb-0.5 border-b border-slate-800">
                  <span className="text-amber-300 font-bold text-[8.5px]">รหัสหลัก R1:</span>
                  <span className="font-mono font-extrabold text-amber-400 text-[9px]">
                    Main ID #{node.r1MainId}
                  </span>
                </div>
              )
            )}

            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-semibold">อัพไลน์:</span>
              <button
                type="button"
                onClick={() => node.parentId > 0 && navigateToNode(node.parentId)}
                className="font-mono font-extrabold text-indigo-400 hover:underline cursor-pointer text-[9px]"
              >
                {node.parentId === 0 ? 'Root (#0)' : `#${node.parentId}`}
              </button>
            </div>

            {node.isClone && (
              <div className="flex items-center justify-between">
                <span className="text-fuchsia-300 font-bold">รหัสหลัก:</span>
                <button
                  type="button"
                  onClick={() => navigateToNode(node.originMainId)}
                  className="font-mono font-extrabold text-amber-400 hover:underline cursor-pointer text-[9px]"
                  title={`คลิกเพื่อไปที่รหัสหลัก ${node.isExtraLineage ? node.extraMainLabel : `#${node.originMainId}`}`}
                >
                  {node.isExtraLineage
                    ? node.extraMainLabel || `Extra R${node.rank}-#${node.originMainId}`
                    : `#${node.originMainId}`}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span
                className={`font-bold ${
                  node.isClone ? 'text-emerald-400' : 'text-indigo-300'
                }`}
              >
                ผู้แนะนำ:
              </span>
              <button
                type="button"
                onClick={() =>
                  node.directUplineNodeId > 0 && navigateToNode(node.directUplineNodeId)
                }
                className="font-mono font-extrabold text-amber-400 hover:underline cursor-pointer text-[9px]"
              >
                {node.directUplineNodeId === 0 ? '#0' : `#${node.directUplineNodeId}`}
              </button>
            </div>
          </div>

          {/* 2-Column Left / Right Slot Box */}
          <div className="mt-1 grid grid-cols-2 gap-1">
            {/* Left Slot */}
            <div
              className={`rounded-md p-1 flex flex-col justify-between h-auto ${
                node.leftChild > 0
                  ? 'bg-emerald-950/30 border border-emerald-500/45'
                  : 'bg-slate-950/60 border border-dashed border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-0.5">
                <span className="text-[9px] font-bold text-emerald-400 leading-tight">
                  ↙ ซ้าย
                </span>

                {node.leftChild > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigateToNode(node.leftChild)}
                    className="font-mono font-extrabold text-[9px] text-emerald-300 hover:text-white transition cursor-pointer"
                  >
                    {formatChildLabel(leftChildNode, node.leftChild)}
                  </button>
                ) : activeLocks.some((l) => l.parentId === String(node.id) && l.isLeft) ? (
                  <span
                    className="px-1 py-0.2 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-extrabold text-[7.5px] animate-pulse"
                    title="ตำแหน่งนี้กำลังถูกล็อคจองในระบบ FIFO Queue"
                  >
                    🔒 จอง
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openRegisterModal(node.originMainId || node.id, node.id, true)}
                    className="px-1.5 py-0.2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-[8.5px] shadow transition cursor-pointer"
                  >
                    +ลง
                  </button>
                )}
              </div>
              <div className="mt-0.5 text-[8px] text-slate-300 font-mono leading-tight">
                {node.isExtraLineage
                  ? `30% | 30%ช | 35%→#${node.directUplineNodeId || 1}`
                  : '30% | 15ช | 35%'}
              </div>
            </div>

            {/* Right Slot */}
            <div
              className={`rounded-md p-1 flex flex-col justify-between h-auto ${
                node.rightChild > 0
                  ? 'bg-purple-950/35 border border-purple-500/50'
                  : 'bg-slate-950/60 border border-dashed border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-0.5">
                <span className="text-[9px] font-bold text-purple-300 leading-tight">
                  ↘ ขวา
                </span>

                {node.rightChild > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigateToNode(node.rightChild)}
                    className="font-mono font-extrabold text-[9px] text-purple-200 hover:text-white transition cursor-pointer"
                  >
                    {formatChildLabel(rightChildNode, node.rightChild)}
                  </button>
                ) : activeLocks.some((l) => l.parentId === String(node.id) && !l.isLeft) ? (
                  <span
                    className="px-1 py-0.2 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-extrabold text-[7.5px] animate-pulse"
                    title="ตำแหน่งนี้กำลังถูกล็อคจองในระบบ FIFO Queue"
                  >
                    🔒 จอง
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openRegisterModal(node.originMainId || node.id, node.id, false)}
                    className="px-1.5 py-0.2 rounded bg-purple-500 hover:bg-purple-400 text-white font-extrabold text-[8.5px] shadow transition cursor-pointer"
                  >
                    +ลง
                  </button>
                )}
              </div>
              <div className="mt-0.5 text-[8px] text-slate-300 font-mono leading-tight">
                100% Rebirth
              </div>
            </div>
          </div>

          {/* Vault & Clone Count Pill Bar */}
          {!node.isClone && (
            <div className="mt-1 px-1.5 py-0.5 rounded-md bg-[#0c1020] border border-slate-800/90 flex items-center justify-between gap-0.5 text-[8.5px]">
              <span className="text-slate-200 font-mono flex items-center gap-0.5">
                <Shield className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                <span>
                  {node.isExtraId ? (
                    <>
                      Vault 35%:{' '}
                      <strong className="text-rose-300">
                        → Extra Pool #{node.directUplineNodeId || 1}
                      </strong>
                    </>
                  ) : (
                    <>
                      Vault:{' '}
                      <strong className="text-white">
                        {node.upgradeRankPool > 0
                          ? `${node.upgradeRankPool.toFixed(2)}/${node.nextRankPrice}U`
                          : selectedRank <= 4 &&
                            (node.newAutoIdPool > 0 || node.totalAutoIdCount > 0 || node.id === 1)
                          ? `${node.newAutoIdPool.toFixed(2)}/5U`
                          : `${node.vaultBalance.toFixed(2)}/${node.nextRankPrice}U`}
                      </strong>
                    </>
                  )}
                </span>
              </span>
              {(
                node.isExtraId
                  ? node.spawnedCloneIds.length > 0
                  : node.totalClonesCount > 0 || node.spawnedCloneIds.length > 0
              ) ? (
                <button
                  type="button"
                  onClick={() =>
                    node.spawnedCloneIds[0] &&
                    navigateToNode(node.spawnedCloneIds[0].cloneNodeId)
                  }
                  className="text-amber-400 hover:text-amber-300 font-bold underline flex items-center gap-0.5 cursor-pointer text-[8.5px]"
                >
                  <span>
                    ✨ โคลน{' '}
                    {node.isExtraId
                      ? node.spawnedCloneIds.length
                      : Math.max(node.totalClonesCount, node.spawnedCloneIds.length)}{' '}
                    ↘
                  </span>
                </button>
              ) : (
                <span className="text-slate-500 font-medium text-[8px]">ปกติ</span>
              )}
            </div>
          )}

          {/* Open Benefit & History Popup Modal Button */}
          <button
            type="button"
            onClick={() => {
              const curMaxR = node.targetMainIdCurrentRank || node.rank || 1;
              setModalUpgradeTargetRank(Math.min(27, curMaxR + 1));
              setModalUpgradeMessage(null);
              setModalUpgradeError(null);
              setBenefitModalTab('all');
              setExpandedBenefitNodeId((prev) => (prev === node.id ? null : node.id));
              fetchPerIdHistoryForModal();
            }}
            className={`mt-1 w-full py-1 px-1.5 rounded-md font-bold text-[8.5px] flex items-center justify-between transition cursor-pointer ${
              isBenefitOpen
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                : 'bg-[#0c1020] hover:bg-slate-900 text-indigo-200 border border-slate-800'
            }`}
          >
            <span className="flex items-center gap-0.5">
              <Coins className="w-2.5 h-2.5 text-indigo-300 shrink-0" />
              <span>ดูผลประโยชน์</span>
            </span>
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    );
  };

  // Recursive Binary Subtree Renderer (Automatically extends depth to render all connected nodes)
  const renderBinarySubtree = (nodeId: number, currentDepth: number): React.ReactNode => {
    const resolvedId =
      currentDepth === 1 && !activeNodesMap.has(nodeId)
        ? activeNodesMap.has(1)
          ? 1
          : activeNodesMap.keys().next().value || 1
        : nodeId;
    const node = activeNodesMap.get(resolvedId);
    if (!node) return null;

    // When maxRenderDepth === 0 (Auto), automatically render all levels needed to show every connected node
    const effectiveMaxDepth =
      maxRenderDepth === 0 ? Math.max(15, maxTreeLevelInRank + 2) : maxRenderDepth;
    const hasLeft = node.leftChild > 0 && activeNodesMap.has(node.leftChild);
    const hasRight = node.rightChild > 0 && activeNodesMap.has(node.rightChild);
    const showChildrenRow =
      currentDepth < effectiveMaxDepth && (hasLeft || hasRight || currentDepth === 1);

    return (
      <div className="inline-flex flex-col items-center h-auto w-auto">
        {renderNodeCard(node)}

        {showChildrenRow && (
          <div className="inline-flex items-start justify-center gap-2.5 sm:gap-4 md:gap-5 pt-5 sm:pt-6 h-auto w-auto">
            <div className="inline-flex flex-col items-center h-auto w-auto">
              {hasLeft
                ? renderBinarySubtree(node.leftChild, currentDepth + 1)
                : renderEmptySlotCard(node, true)}
            </div>
            <div className="inline-flex flex-col items-center h-auto w-auto">
              {hasRight
                ? renderBinarySubtree(node.rightChild, currentDepth + 1)
                : renderEmptySlotCard(node, false)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const allClonesInRank = useMemo(() => {
    return Array.from(activeNodesMap.values()).filter((n) => n.isClone);
  }, [activeNodesMap]);

  return (
    <div className="w-full h-auto bg-[#0b1020] border border-slate-800 rounded-2xl sm:rounded-3xl p-3 sm:p-5 md:p-6 shadow-2xl space-y-3 sm:space-y-3.5">
      {/* Top Header & Controls Block (Stacked neatly matching screenshot) */}
      <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-800/90">
        {/* Row 1: Title & Register Button */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <span>🌳 ผังต้นไม้ไบนารี่ 27 Ranks</span>
            </h2>
            {justUpdatedBadge && (
              <span className="text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-400 font-semibold flex items-center gap-1 animate-pulse">
                <Check className="w-3 h-3 text-emerald-300" />
                <span>อัปเดตต่อผังอัตโนมัติแล้ว</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenRegisterModal) {
                onOpenRegisterModal();
              } else {
                openRegisterModal(focusRootId || 1);
              }
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-950/60 border border-emerald-300/40 transition cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-950 shrink-0" />
            <span>
              {language === 'th' ? '+ สมัครสมาชิก / ลงรหัสเพิ่ม' : '+ Register / Add ID'}
            </span>
          </button>
        </div>

        {/* Row 2: Contract Address Badge & Auto-Extend Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
            Contract: {(contractAddress || CONTRACT_ADDRESS).slice(0, 6)}...{(contractAddress || CONTRACT_ADDRESS).slice(-4)}
          </span>
          <button
            type="button"
            onClick={() => setAutoFollowNewNodes((prev) => !prev)}
            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
              autoFollowNewNodes
                ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
            title="เมื่อมีโหนดใหม่เข้ามา ระบบจะนำโหนดใหม่มาต่อแสดงในผังให้อัตโนมัติทันที"
          >
            <span>{autoFollowNewNodes ? '🟢 ต่อผังอัตโนมัติ: เปิด' : '⚪ ต่อผังอัตโนมัติ: ปิด'}</span>
          </button>
        </div>

        {/* Row 3: Mode Switcher Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setViewMode('onchain');
              setFocusRootId(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
              viewMode === 'onchain'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/50'
                : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>ข้อมูลจริงบนเชน ({totalNodesInRank} โหนด)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('demoCloneTree');
              setFocusRootId(3);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
              viewMode === 'demoCloneTree'
                ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-950/50'
                : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>ดูตัวอย่าง #7 & โคลน #10</span>
          </button>
        </div>

        {/* Row 4: Depth Selector (Includes Auto-All-Levels so new nodes at any depth are always shown) */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-400 font-semibold">ความลึก:</span>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl flex-wrap">
            <button
              type="button"
              onClick={() => setMaxRenderDepth(0)}
              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                maxRenderDepth === 0
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ทั้งหมด (Auto {maxTreeLevelInRank} ชั้น)
            </button>
            {[4, 6, 8, 12, 15].map((depthVal) => (
              <button
                key={depthVal}
                type="button"
                onClick={() => setMaxRenderDepth(depthVal)}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                  maxRenderDepth === depthVal
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {depthVal} ชั้น
              </button>
            ))}
          </div>
        </div>

        {/* แถบแจ้งเตือนการต่อสาย (Node Line Connection Notification Banner) */}
        {latestNodeInRank && (
          <div
            className={`rounded-2xl p-3 sm:p-3.5 border transition-all duration-300 relative overflow-hidden ${
              latestNewNodeAlert || newlyAddedNodeIds.size > 0
                ? 'bg-gradient-to-r from-amber-950/80 via-slate-900 to-emerald-950/80 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.35)] ring-1 ring-amber-400/50'
                : 'bg-slate-900/95 border-emerald-500/40 shadow-lg'
            }`}
          >
            {/* Background ambient glow pulse */}
            {(latestNewNodeAlert || newlyAddedNodeIds.size > 0) && (
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-amber-500/10 rounded-full blur-2xl pointer-events-none animate-pulse" />
            )}

            <div className="flex items-center justify-between flex-wrap gap-2.5 relative z-10">
              {/* Left Column: Connection Info */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-extrabold text-[11px] shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>⚡ แถบแจ้งเตือนการต่อสายไบนารี่</span>
                </div>

                <div className="text-xs text-slate-100 font-medium flex items-center gap-1.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    {latestNodeInRank.isClone ? (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-black text-[10px]">✨ มาใหม่</span>
                        โคลน <strong className="text-amber-300 font-black">#{latestNodeInRank.id}</strong> (รหัสหลัก <strong className="text-amber-400">#{latestNodeInRank.r1MainId || latestNodeInRank.originMainId}</strong>)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <span className="px-1.5 py-0.2 rounded bg-emerald-400 text-slate-950 font-black text-[10px]">🟢 ล่าสุด</span>
                        รหัสหลัก <strong className="text-amber-300 font-black">#{latestNodeInRank.r1MainId || latestNodeInRank.originMainId}</strong> (โหนด <strong className="text-white font-extrabold">#{latestNodeInRank.id}</strong>)
                      </span>
                    )}
                  </span>

                  <span className="text-slate-400">ต่อสายเข้าผังใต้:</span>

                  <span className="px-2 py-0.5 rounded-lg bg-indigo-950 border border-indigo-500/50 font-mono font-extrabold text-indigo-300 text-[11px]">
                    อัพไลน์ #{latestNodeInRank.parentId === 0 ? 'Root (#0)' : latestNodeInRank.parentId}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded-lg font-mono font-black text-[11px] border ${
                      latestNodeInRank.isLeft
                        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
                        : 'bg-purple-950/90 text-purple-300 border-purple-500/50'
                    }`}
                  >
                    {latestNodeInRank.isLeft ? '↙ ฝั่งซ้าย (Left Slot)' : '↘ ฝั่งขวา (Right Slot)'} • ชั้น {latestNodeInRank.level}
                  </span>
                </div>
              </div>

              {/* Right Column: Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const targetFocus =
                      latestNodeInRank.parentId > 0 ? latestNodeInRank.parentId : latestNodeInRank.id;
                    navigateToNode(targetFocus);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-md shadow-amber-950/50 cursor-pointer transition flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>ดูจุดต่อสาย #{latestNodeInRank.parentId} → #{latestNodeInRank.id}</span>
                </button>

                {focusRootId !== 1 && (
                  <button
                    type="button"
                    onClick={() => navigateToNode(1)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold text-xs cursor-pointer transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>ดูผังรวม (#1)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Row 5: Rank Matrices Button Bar (Matching User's Screenshot Design) */}
        <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
          {/* Top Info & Sync Controls Row */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                <span>⚡ เลือกผังแรงค์ (Rank Matrix):</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[11px] font-mono font-extrabold">
                {language === 'th' ? `กำลังดู ผัง ${selectedRank}` : `Viewing Rank ${selectedRank}`} ({RANK_PRICES_USDT[selectedRank - 1] || 5} USDT)
              </span>
            </div>

            {/* Real-Time Live Status Controls */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Real-Time Live Status Pill */}
              <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 px-2.5 py-1 rounded-xl text-xs">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRealtimeActive
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-slate-500'
                  }`}
                />
                <span className="font-bold text-white text-[11px] flex items-center gap-1">
                  {isRealtimeActive ? (
                    <span className="text-emerald-400">⚡ LIVE</span>
                  ) : (
                    <span className="text-slate-400">🔴 Pause</span>
                  )}
                </span>
                {isRealtimeActive && (
                  <span
                    className="font-mono text-[10px] text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.2 rounded font-extrabold"
                    title={`นับถอยหลังซิงก์รอบถัดไป: ${realtimeCountdown} วินาที`}
                  >
                    {realtimeCountdown >= 60
                      ? `${Math.floor(realtimeCountdown / 60)}:${String(realtimeCountdown % 60).padStart(2, '0')}`
                      : `${realtimeCountdown}s`}
                  </span>
                )}
              </div>

              {/* Real-Time Interval Dropdown Selector */}
              <select
                value={realtimeInterval}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRealtimeInterval(val);
                  setRealtimeCountdown(val);
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-[11px] font-mono text-emerald-300 focus:outline-none cursor-pointer"
                title="เลือกรอบเวลาดึงข้อมูล Real-Time"
              >
                <option value={5}>5วิ (อัตโนมัติทันที)</option>
                <option value={10}>10วิ</option>
                <option value={30}>30วิ</option>
                <option value={60}>60วิ (1นาที)</option>
                <option value={120}>120วิ (2นาที)</option>
                <option value={180}>180วิ (3นาที)</option>
              </select>

              {/* Toggle Real-Time Sync Button */}
              <button
                type="button"
                onClick={() => setIsRealtimeActive((prev) => !prev)}
                className={`px-2 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer border ${
                  isRealtimeActive
                    ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {isRealtimeActive
                  ? `${realtimeInterval >= 60 ? `${realtimeInterval / 60}m` : `${realtimeInterval}s`}`
                  : 'ปิด'}
              </button>

              {/* Instant Manual Refresh Button */}
              <button
                type="button"
                onClick={() => {
                  setRealtimeCountdown(realtimeInterval);
                  loadOnChainTree(selectedRank, { silent: true, forceSync: true });
                }}
                disabled={isLoadingTree || isLiveSyncing}
                className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer flex items-center gap-1 font-semibold text-[11px] disabled:opacity-50"
                title="ดึงข้อมูลล่าสุดจากบล็อกเชนและฐานข้อมูลทันที"
              >
                <RefreshCw
                  className={`w-3 h-3 ${
                    isLoadingTree || isLiveSyncing ? 'animate-spin text-emerald-400' : 'text-amber-400'
                  }`}
                />
                <span>{isLoadingTree || isLiveSyncing ? '...' : 'ดึงทันที'}</span>
              </button>

              {/* Last Sync Timestamp */}
              <span className="text-[10px] text-slate-400 font-mono hidden md:inline-block ml-1">
                {lastSyncTime}
              </span>
            </div>
          </div>

          {/* Horizontal Scrollable Rank Buttons Bar (Design matching Screenshot: [✓ 👑 ผัง 1 62 5U] [✓ ผัง 2 4 10U] [👑 ผัง 3 2 20U] [ผัง 4 30U]) */}
          <div className="w-full overflow-x-auto pb-2 pt-0.5 scrollbar-thin scrollbar-thumb-indigo-500/40 scrollbar-track-slate-950 flex items-center gap-2 select-none">
            {RANK_PRICES_USDT.map((price, idx) => {
              const r = idx + 1;
              const isSelected = selectedRank === r;
              const isPassed = currentUserRank > r;
              const isCurrent = currentUserRank === r;
              const count =
                rankNodeCounts[r] !== undefined
                  ? rankNodeCounts[r]
                  : (r === selectedRank ? totalNodesInRank : (r === 1 ? 1 : 0));

              // Determine exact container styles according to user screenshot
              let buttonClasses = '';
              let textColor = '';
              let countBadgeStyle = '';
              let priceBadgeStyle = '';

              if (isSelected) {
                // Button 1 (Selected): Vibrant Purple / Violet gradient with glowing border
                buttonClasses =
                  'bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 border-2 border-indigo-300 shadow-[0_0_16px_rgba(139,92,246,0.5)] ring-2 ring-indigo-400/30';
                textColor = 'text-white font-extrabold';
                countBadgeStyle = 'bg-black/40 text-cyan-300 border border-cyan-400/30 font-bold';
                priceBadgeStyle = 'bg-black/40 text-purple-100 border border-purple-400/30 font-bold';
              } else if (isCurrent) {
                // Button 3 (Current Max Rank): Dark Amber / Bronze with golden outline
                buttonClasses =
                  'bg-[#24170a] hover:bg-[#34220f] border border-amber-600/70 shadow-[0_0_10px_rgba(245,158,11,0.25)] text-amber-300';
                textColor = 'text-amber-400 font-extrabold';
                countBadgeStyle = 'bg-black/50 text-emerald-300 border border-emerald-500/25 font-bold';
                priceBadgeStyle = 'bg-black/50 text-slate-300 border border-slate-700/60 font-medium';
              } else if (isPassed) {
                // Button 2 (Passed Rank): Dark Indigo / Slate with subtle border
                buttonClasses =
                  'bg-[#181a38] hover:bg-[#21244c] border border-[#3b3e6e] text-slate-200';
                textColor = 'text-white font-bold';
                countBadgeStyle = 'bg-black/50 text-emerald-300 border border-emerald-500/25 font-bold';
                priceBadgeStyle = 'bg-black/50 text-slate-300 border border-slate-700/60 font-medium';
              } else {
                // Button 4 (Future / Locked): Dark slate outline
                buttonClasses =
                  'bg-[#0f1422] hover:bg-[#151c2e] border border-slate-800 text-slate-400';
                textColor = 'text-slate-300 font-bold';
                countBadgeStyle = 'bg-black/40 text-slate-400 border border-slate-800 font-medium';
                priceBadgeStyle = 'bg-black/40 text-slate-400 border border-slate-800 font-medium';
              }

              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    const targetRank = r;
                    setSelectedRank(targetRank);
                    setFocusRootId(1);
                    setNavigationHistory([1]);
                    setSearchInput('1');
                    setExpandedBenefitNodeId(null);
                    setLatestNewNodeAlert(null);
                    setZoomScale(0.55);
                    setRealtimeCountdown(realtimeInterval);
                    loadOnChainTree(targetRank);
                  }}
                  className={`px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer shrink-0 flex items-center gap-1.5 text-xs ${buttonClasses}`}
                  title={`คลิกเพื่อดูผัง Rank ${r} (${price} USDT) • มีสมาชิกในผังนี้ ${count} โหนด`}
                >
                  {/* Green Checkmark: Show if passed or currently selected */}
                  {(isSelected || isPassed) && (
                    <span className="text-emerald-400 font-black text-xs leading-none drop-shadow">
                      ✓
                    </span>
                  )}

                  {/* Crown Icon: Show for current rank or selected rank */}
                  {(isSelected || isCurrent) && (
                    <span className="text-xs leading-none">👑</span>
                  )}

                  {/* Rank Label */}
                  <span className={`${textColor} text-xs tracking-tight whitespace-nowrap`}>
                    {language === 'th' ? `ผัง ${r}` : `Rank ${r}`}
                  </span>

                  {/* Node Count Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-md font-mono text-[10.5px] leading-tight ${countBadgeStyle}`}
                  >
                    {count}
                  </span>

                  {/* Price Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-md font-mono text-[10.5px] leading-tight ${priceBadgeStyle}`}
                  >
                    {price}U
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>


      {/* 2. Navigation, Breadcrumb & Auto-Fit Bar */}
      <div className="rounded-2xl bg-[#11172a] border border-slate-800/90 p-3 sm:p-3.5 space-y-2.5">
        {/* Row 1: Back Button + Search Input */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleGoBack}
            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>ย้อนกลับผัง</span>
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = searchInput.trim();
              if (/^0x[a-fA-F0-9]{6,}$/.test(trimmed)) {
                const lower = trimmed.toLowerCase();
                const found = Array.from(activeNodesMap.values()).find((n) =>
                  n.owner.toLowerCase().startsWith(lower)
                );
                if (found) navigateToNode(found.id);
                return;
              }
              const target = parseInt(trimmed.replace(/[^0-9]/g, ''), 10);
              if (target >= 1) navigateToNode(target);
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              inputMode="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="#ID"
              className="w-20 sm:w-24 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="p-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
              title="ค้นหาโหนด"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Row 2: Breadcrumbs & Zoom Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm flex-wrap">
            <span className="text-slate-400 font-medium">เส้นทางผัง:</span>
            {breadcrumbPath.map((nodeId, idx) => (
              <React.Fragment key={nodeId}>
                {idx > 0 && <span className="text-slate-600">→</span>}
                <button
                  type="button"
                  onClick={() => navigateToNode(nodeId)}
                  className={`px-2.5 py-1 rounded-xl font-mono font-bold text-xs transition cursor-pointer ${
                    nodeId === focusRootId
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  #{nodeId}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setZoomScale((z) => Math.max(0.35, Number((z - 0.05).toFixed(2))))}
              className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
              title="ย่อผัง"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomScale((z) => (z === 0.55 ? 1 : 0.55))}
              className="text-[10px] font-mono text-amber-300 font-extrabold hover:text-white px-1.5 cursor-pointer"
              title="สลับขนาด 55% / 100%"
            >
              {Math.round(zoomScale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoomScale((z) => Math.min(1.25, Number((z + 0.05).toFixed(2))))}
              className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
              title="ขยายผัง"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleAutoFitScreen}
              className="px-2 py-0.5 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="ปรับขนาดให้พอดีหน้าจออัตโนมัติ"
            >
              <Maximize2 className="w-3 h-3" />
              <span>พอดีจอ</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Clone Lineage Summary Trigger Bar & Popup Modal */}
      {allClonesInRank.length > 0 && (
        <>
          <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/35 px-3.5 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsCloneStatusPopupOpen(true)}
              className="flex items-center gap-2 text-left text-xs font-bold text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
            >
              <Dna className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                สรุปสถานะรหัสโคลนนิ่ง (Rebirth Clone Status) ใน Rank {selectedRank}: พบ{' '}
                <span className="text-amber-300 font-mono underline decoration-emerald-400/60">
                  {allClonesInRank.length} รหัสโคลน
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsCloneStatusPopupOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-100 font-semibold text-xs border border-emerald-500/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-300" />
              <span>ดูรายการโคลน ({allClonesInRank.length})</span>
            </button>
          </div>

          {isCloneStatusPopupOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5"
              onClick={() => setIsCloneStatusPopupOpen(false)}
            >
              <div
                className="w-full max-w-3xl rounded-2xl bg-slate-950 border border-emerald-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="px-4 py-3.5 bg-emerald-950/50 border-b border-emerald-500/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-300">
                    <Dna className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      สรุปสถานะรหัสโคลนนิ่ง (Rebirth Clone Status) ใน Rank {selectedRank}: พบ{' '}
                      {allClonesInRank.length} รหัสโคลน
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCloneStatusPopupOpen(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold cursor-pointer shrink-0"
                  >
                    ✕ ปิดหน้าต่าง
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-3.5 sm:p-4 overflow-y-auto space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {allClonesInRank.map((cloneNode) => (
                      <div
                        key={cloneNode.id}
                        className="bg-slate-900/90 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="font-mono font-bold text-emerald-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-amber-400">Main #{cloneNode.r1MainId || cloneNode.originMainId}</span>
                            <span className="text-emerald-200">(โคลน R{cloneNode.rank || selectedRank}-#{cloneNode.id})</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-[10px]">
                              รอบ {cloneNode.cloneRound}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300">
                            รหัสหลัก:{' '}
                            <span className="font-mono font-bold text-amber-300">
                              #{cloneNode.originMainId}
                            </span>{' '}
                            • อัพไลน์ #{cloneNode.parentId} ({cloneNode.isLeft ? 'ซ้าย' : 'ขวา'})
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              navigateToNode(cloneNode.id);
                              setIsCloneStatusPopupOpen(false);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 font-mono text-[10px] border border-emerald-500/40 cursor-pointer"
                          >
                            ดู #{cloneNode.id}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigateToNode(cloneNode.originMainId);
                              setIsCloneStatusPopupOpen(false);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-[10px] border border-slate-700 cursor-pointer"
                          >
                            รหัสหลัก #{cloneNode.originMainId}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-4 py-2.5 bg-slate-900/80 border-t border-slate-800 flex items-center justify-end text-[11px] text-slate-400">
                  <button
                    type="button"
                    onClick={() => setIsCloneStatusPopupOpen(false)}
                    className="px-3.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 font-semibold cursor-pointer"
                  >
                    ตกลง
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 3b. Rank 2-27 Single-Node On-Chain Info Strip */}
      {selectedRank >= 2 && totalNodesInRank <= 1 && viewMode === 'onchain' && (
        <div className="rounded-2xl bg-indigo-950/35 border border-indigo-500/35 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="text-indigo-200 flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold">
              Rank {selectedRank} ({RANK_PRICES_USDT[selectedRank - 1]} USDT)
            </span>
            <span>
              <strong>Root Node #1</strong> ประจำผัง Rank {selectedRank}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setViewMode('demoCloneTree');
              setFocusRootId(1);
              setNavigationHistory([1]);
            }}
            className="px-3 py-1.5 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white font-semibold text-xs border border-purple-400/40 transition cursor-pointer shrink-0"
          >
            👁️ ดูผังจำลอง Rank {selectedRank}
          </button>
        </div>
      )}

      {/* 4. Main Auto-Height & Auto-Width Binary Tree Viewport */}
      <div
        ref={scrollViewportRef}
        className="w-full h-auto rounded-2xl sm:rounded-3xl bg-[#080c17] border border-slate-800/90 p-3 sm:p-6 md:p-8 overflow-x-auto overflow-y-visible matrix-scroll-container"
      >
        <div
          style={{
            zoom: zoomScale,
          }}
          className="w-max min-w-full h-auto flex justify-center items-start mx-auto"
        >
          <div
            ref={treeContentRef}
            className="relative inline-flex flex-col items-center h-auto w-max px-2 sm:px-4 py-3"
          >
            {/* Dynamic SVG Curved Connector Lines Overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
              {connectorLines.map((line) => {
                const midY = line.y1 + (line.y2 - line.y1) * 0.5;
                const d = `M ${line.x1} ${line.y1} C ${line.x1} ${midY}, ${line.x2} ${midY}, ${line.x2} ${line.y2}`;
                const strokeColor = line.isFilled
                  ? line.isLeft
                    ? '#10b981'
                    : '#a855f7'
                  : '#64748b';

                return (
                  <path
                    key={line.key}
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2.2"
                    strokeDasharray={line.isFilled ? undefined : '5 5'}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>

            {/* Recursive Binary Tree Nodes */}
            {isLoadingTree && activeNodesMap.size === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                <span className="text-sm font-semibold">
                  {language === 'th'
                    ? 'กำลังโหลดข้อมูลผังต้นไม้ไบนารี่จากบล็อกเชน...'
                    : 'Loading binary tree nodes from blockchain...'}
                </span>
              </div>
            ) : (
              renderBinarySubtree(focusRootId, 1)
            )}
          </div>
        </div>
      </div>

      {/* Registration Popup Modal */}
      {isRegisterModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4"
          onClick={() => !regIsSubmitting && setIsRegisterModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-slate-950 border-2 border-emerald-500/60 shadow-[0_0_50px_rgba(16,185,129,0.35)] overflow-hidden p-4 sm:p-5 text-left space-y-3.5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    {language === 'th' ? '📝 ฟอร์มสมัครสมาชิก DApp' : '📝 Register DApp Node'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {language === 'th' ? 'ผัง Rank 1 (5 USDT ต่อโหนด)' : 'Rank 1 Matrix (5 USDT / Node)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                disabled={regIsSubmitting}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Placement Box (if triggered from node slot) */}
            {regTargetParentId !== undefined && (
              <div className="rounded-xl bg-emerald-950/40 border border-emerald-500/40 p-2.5 space-y-1 text-xs">
                <div className="flex items-center justify-between text-emerald-300 font-bold">
                  <span>🎯 ตำแหน่งที่เลือกวาง:</span>
                  <span className="font-mono text-amber-400">
                    {regIsLeft ? '↙ ฝั่งซ้าย' : '↘ ฝั่งขวา'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  อัพไลน์ผัง #{regTargetParentId} • ผู้แนะนำตรง #{regSponsorId}
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-3 text-xs">
              {/* Sponsor Node ID Input */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  {language === 'th' ? 'รหัสผู้แนะนำตรง (Sponsor Node ID):' : 'Direct Sponsor Node ID:'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={regSponsorId}
                    onChange={(e) => setRegSponsorId(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setRegSponsorId(1)}
                    className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono text-xs cursor-pointer"
                  >
                    #1 (Root)
                  </button>
                </div>
              </div>

              {/* Number of Nodes */}
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">
                  {language === 'th' ? 'จำนวนรหัสที่ต้องการสมัคร:' : 'Number of Registration Nodes:'}
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 5].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setRegNodeCount(cnt)}
                      className={`flex-1 py-1.5 rounded-xl font-mono text-xs font-bold transition cursor-pointer border ${
                        regNodeCount === cnt
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {cnt} รหัส ({cnt * 5} U)
                    </button>
                  ))}
                </div>
              </div>

              {/* USDT Balance & Allowance Box */}
              <div className="rounded-xl bg-[#0d1222] border border-slate-800 p-2.5 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ยอดคงเหลือ USDT:</span>
                  <span className="font-mono font-bold text-white">{usdtBalance || '0.00'} USDT</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">สิทธิ์การใช้งาน (Allowance):</span>
                  <span className="font-mono font-bold text-emerald-400">{allowance || '0.00'} USDT</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-300 font-bold">รวมค่าสมัครทั้งหมด:</span>
                  <span className="font-mono font-extrabold text-amber-400 text-sm">
                    {regNodeCount * 5} USDT
                  </span>
                </div>
              </div>

              {/* Messages / Alerts */}
              {regTxError && (
                <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="break-words">{regTxError}</span>
                </div>
              )}
              {regTxMessage && (
                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{regTxMessage}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {parseFloat(allowance || '0') < regNodeCount * 5 && (
                  <button
                    type="button"
                    onClick={handleModalApproveUsdt}
                    disabled={regIsApproving || regIsSubmitting}
                    className="w-full py-2.5 px-3 rounded-xl font-extrabold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {regIsApproving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    <span>
                      {regIsApproving
                        ? 'กำลังอนุมัติ USDT...'
                        : `อนุมัติ USDT (${regNodeCount * 5} USDT)`}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleModalSubmitRegister}
                  disabled={regIsSubmitting || regIsApproving}
                  className="w-full py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-950/60 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {regIsSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {regIsSubmitting
                      ? 'กำลังสมัครสมาชิก...'
                      : `🚀 ยืนยันสมัครสมาชิก (${regNodeCount * 5} USDT)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* POPUP MODAL: รายละเอียดผลประโยชน์ & ประวัติของไอดี (เมื่อกดปุ่ม ดูผลประโยชน์) */}
      {/* ===================================================================== */}
      {expandedBenefitNodeId !== null && activeNodesMap.has(expandedBenefitNodeId) && (() => {
        const modalNode = activeNodesMap.get(expandedBenefitNodeId)!;
        const targetMainId = modalNode.isExtraLineage
          ? modalNode.directUplineNodeId || 1
          : modalNode.r1MainId || modalNode.originMainId || modalNode.id;
        const idReport =
          (modalNode.rank === 1 && perIdReportsMap.get(modalNode.id)) ||
          perIdReportsMap.get(targetMainId) ||
          null;
        const mainReport = perIdReportsMap.get(targetMainId) || idReport;

        const directHistory: any[] = mainReport?.direct30History || [];
        const levelHistory: any[] = mainReport?.level30History || [];
        const vaultHistory: any[] = mainReport?.vault35History || [];
        const autoIdsList: any[] = mainReport?.autoIdsSpawned || [];
        const extraIdsList: any[] = mainReport?.autoExtraIdsSpawned || [];
        const clonesList: any[] = mainReport?.clonesSpawned || [];
        const rankNodesList: any[] = mainReport?.rankNodesList || [];

        const currentMaxR = Math.max(
          modalNode.targetMainIdCurrentRank || 1,
          mainReport?.currentMaxRank || 1,
          modalNode.rank || 1
        );
        const effectiveTargetRank =
          modalUpgradeTargetRank > currentMaxR
            ? modalUpgradeTargetRank
            : Math.min(27, currentMaxR + 1);
        const targetRankPrice = RANK_PRICES_USDT[effectiveTargetRank - 1] || 10;
        const poolDeduct = Math.min(modalNode.upgradeRankPool, targetRankPrice);
        const netDiffToPay = Math.max(0, Number((targetRankPrice - poolDeduct).toFixed(2)));

        const handleTriggerModalUpgrade = async (rankToUpgrade: number) => {
          if (isModalUpgrading || currentMaxR >= 27 || rankToUpgrade <= currentMaxR) return;
          setIsModalUpgrading(true);
          setModalUpgradeError(null);
          setModalUpgradeMessage(
            `กำลังอัปเกรด Main ID #${targetMainId} สู่ Rank ${rankToUpgrade} (${RANK_PRICES_USDT[rankToUpgrade - 1] || 10} USDT)...`
          );
          try {
            if (onUpgradeToRank) {
              await onUpgradeToRank(rankToUpgrade, targetMainId);
            } else {
              const res = await fetch('/api/matrix/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  targetRank: rankToUpgrade,
                  mainId: targetMainId,
                  owner: modalNode.owner,
                }),
              });
              const data = await res.json();
              if (!res.ok || !data?.success) {
                throw new Error(data?.error || 'ไม่สามารถอัปเกรดแรงค์ได้');
              }
            }
            setModalUpgradeMessage(
              `🚀 อัปเกรด Main ID #${targetMainId} สู่ Rank ${rankToUpgrade} สำเร็จเรียบร้อยแล้ว!`
            );
            setModalUpgradeTargetRank(Math.min(27, rankToUpgrade + 1));
            await fetchPerIdHistoryForModal();
            await loadOnChainTree(selectedRank, { silent: true, forceSync: true });
          } catch (err: any) {
            setModalUpgradeMessage(null);
            setModalUpgradeError(err?.message || 'การอัปเกรดแรงค์ล้มเหลว');
          } finally {
            setIsModalUpgrading(false);
          }
        };

        const titleBadge = modalNode.isExtraLineage
          ? modalNode.extraMainLabel || `Extra R${modalNode.rank}-#${modalNode.originMainId}`
          : modalNode.isClone
          ? `Main #${targetMainId} (โคลน R${modalNode.rank}-#${modalNode.id})`
          : modalNode.isAutoMainId
          ? `Auto ID #${targetMainId} (R${modalNode.rank}-#${modalNode.id})`
          : `Main ID #${targetMainId} (R${modalNode.rank}-#${modalNode.id})`;

        const statusBadgeLabel = modalNode.isClone
          ? 'CLONE ID'
          : modalNode.isExtraId
          ? 'EXTRA ID'
          : modalNode.isAutoMainId
          ? 'AUTO ID'
          : 'MANUAL ID';

        const statusBadgeClass = modalNode.isClone
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          : modalNode.isExtraId
          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
          : modalNode.isAutoMainId
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
            onClick={() => setExpandedBenefitNodeId(null)}
          >
            <div
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0b1022] border-2 border-indigo-500/50 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.9)] p-4 sm:p-6 space-y-4 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
                      <Coins className="w-5 h-5" />
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-white font-mono">
                      {titleBadge}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full border font-mono font-bold text-[11px] ${statusBadgeClass}`}>
                      {statusBadgeLabel}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-bold text-[11px]">
                      Max Rank: R{currentMaxR}
                    </span>
                    {!modalNode.isExtraLineage && currentMaxR < 27 && (
                      <button
                        type="button"
                        disabled={isModalUpgrading}
                        onClick={() => handleTriggerModalUpgrade(effectiveTargetRank)}
                        className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-extrabold text-[11px] shadow-md transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {isModalUpgrading
                            ? 'กำลังอัพเกรด...'
                            : `🚀 อัพ Rank R${effectiveTargetRank}`}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-2">
                    <span>
                      กระเป๋า:{' '}
                      <strong className="text-indigo-300">
                        {modalNode.owner.slice(0, 8)}...{modalNode.owner.slice(-6)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      อัพไลน์ใน R{modalNode.rank}:{' '}
                      <strong className="text-white">
                        {modalNode.parentId === 0 ? 'Root (#0)' : `#${modalNode.parentId}`}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      ผู้แนะนำตรง:{' '}
                      <strong className="text-amber-300">
                        #{modalNode.directUplineNodeId || mainReport?.directSponsorNodeId || 1}
                      </strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedBenefitNodeId(null)}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition cursor-pointer shrink-0"
                  title="ปิดหน้าต่างป๊อปอัพ"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Banner when upgrading inside Modal */}
              {(modalUpgradeMessage || modalUpgradeError) && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                    modalUpgradeError
                      ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                      : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                  }`}
                >
                  <span>{modalUpgradeError || modalUpgradeMessage}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setModalUpgradeMessage(null);
                      setModalUpgradeError(null);
                    }}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Section 1: Summary Cards (Node Earnings + Main ID Cumulative & 3 Pools) */}
              {modalNode.isExtraLineage ? (
                <div className="rounded-xl bg-[#0d1829] border border-cyan-500/45 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                    <span className="font-bold text-cyan-300 text-sm">
                      ✨ รายได้ที่เกิดจากเม็ดซ้ายของ EXTRA ID ({titleBadge})
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 font-mono font-bold">
                      ส่งผลประโยชน์กลับให้ผู้แนะนำตรง #{modalNode.directUplineNodeId || 1}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono">
                    <div className="bg-slate-950/80 border border-emerald-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">
                        30% ค่าแนะนำ → ส่งให้ #{modalNode.directUplineNodeId || 1}
                      </span>
                      <span className="text-emerald-400 font-extrabold text-sm">
                        {modalNode.leftChild > 0
                          ? `+${((RANK_PRICES_USDT[modalNode.rank - 1] || 10) * 0.3).toFixed(2)} USDT`
                          : '0.00 USDT'}
                      </span>
                    </div>
                    <div className="bg-slate-950/80 border border-cyan-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">
                        30% ค่าชั้น → ส่งให้ #{modalNode.directUplineNodeId || 1}
                      </span>
                      <span className="text-cyan-300 font-extrabold text-sm">
                        {modalNode.leftChild > 0
                          ? `+${((RANK_PRICES_USDT[modalNode.rank - 1] || 10) * 0.3).toFixed(2)} USDT`
                          : '0.00 USDT'}
                      </span>
                    </div>
                    <div className="bg-slate-950/80 border border-rose-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">
                        35% Vault → เข้า Extra Pool ของ #{modalNode.directUplineNodeId || 1}
                      </span>
                      <span className="text-rose-400 font-extrabold text-sm">
                        {modalNode.leftChild > 0
                          ? `+${((RANK_PRICES_USDT[modalNode.rank - 1] || 10) * 0.35).toFixed(2)} USDT`
                          : '0.00 USDT'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Box 1: ผลประโยชน์เฉพาะโหนดที่กด */}
                  <div className="rounded-xl bg-[#09191f] border border-emerald-500/40 p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-1.5">
                      <span className="font-bold text-emerald-400 text-xs sm:text-sm">
                        📍 ผลประโยชน์เฉพาะโหนดนี้ (R{modalNode.rank}-#{modalNode.id})
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                        {modalNode.isClone ? 'Clone Node' : 'Main Node'}
                      </span>
                    </div>
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">30% ค่าแนะนำตรง (เฉพาะโหนดนี้):</span>
                        <span className="font-extrabold text-emerald-400">
                          +{modalNode.directRewardThisNode.toFixed(2)} USDT
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">30% ค่าชั้น ยูนิเลเวล 15 ชั้น (เฉพาะโหนดนี้):</span>
                        <span className="font-extrabold text-cyan-300">
                          +{modalNode.unilevelRewardThisNode.toFixed(2)} USDT
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-emerald-500/20">
                        <span className="text-slate-300">35% Vault โหนดนี้ (คงเหลือใน R{modalNode.rank}):</span>
                        <span className="font-extrabold text-amber-300">
                          +{modalNode.vaultBalance.toFixed(2)} USDT
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Box 2: ผลประโยชน์สะสมของรหัสหลัก & 3 Pools + ปุ่มอัพ Rank */}
                  <div className="rounded-xl bg-[#10162f] border border-indigo-500/40 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-indigo-500/20 pb-1.5">
                      <span className="font-bold text-indigo-300 text-xs sm:text-sm">
                        💎 สะสมรวมของรหัสหลัก (Main ID #{targetMainId} ทุกแรงค์)
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                        แยกกระปุกอิสระ
                      </span>
                    </div>
                    <div className="space-y-1 font-mono text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">รวม 30% ค่าแนะนำ (ทุกแรงค์):</span>
                        <span className="font-extrabold text-emerald-400">
                          +{(mainReport?.direct30TotalUsdt ?? modalNode.directRewardAllNodes).toFixed(2)} USDT
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">รวม 30% ค่าชั้น 15 ชั้น (ทุกแรงค์):</span>
                        <span className="font-extrabold text-cyan-300">
                          +{(mainReport?.level30TotalUsdt ?? modalNode.unilevelRewardAllNodes).toFixed(2)} USDT
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">รวม 35% อัพเกรดสะสมทั้งหมด (Gross Vault):</span>
                        <span className="font-extrabold text-indigo-300">
                          +{(mainReport?.vault35GrossTotalUsdt ?? 0).toFixed(2)} USDT
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-indigo-500/20 text-[10px]">
                        <div className="bg-slate-950/90 border border-amber-500/30 rounded p-1.5 text-center">
                          <span className="text-slate-400 block">Upgrade Pool</span>
                          <span className="text-amber-400 font-extrabold text-xs">
                            {modalNode.upgradeRankPool.toFixed(2)} U
                          </span>
                        </div>
                        <div className="bg-slate-950/90 border border-yellow-500/30 rounded p-1.5 text-center">
                          <span className="text-slate-400 block">Auto ID Pool</span>
                          <span className="text-yellow-400 font-extrabold text-xs">
                            {modalNode.newAutoIdPool.toFixed(2)} U
                          </span>
                        </div>
                        <div className="bg-slate-950/90 border border-rose-500/30 rounded p-1.5 text-center">
                          <span className="text-slate-400 block">Extra ID Pool</span>
                          <span className="text-rose-400 font-extrabold text-xs">
                            {modalNode.newExtraIdPool.toFixed(2)} U
                          </span>
                        </div>
                      </div>

                      {/* ปุ่มอัพเกรด Rank ของไอดีนี้โดยตรงในหน้าต่างป๊อปอัพ */}
                      {currentMaxR >= 27 ? (
                        <div className="mt-2 pt-2 border-t border-indigo-500/30 text-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-[11px]">
                            👑 รหัสหลัก #{targetMainId} อยู่ใน Rank สูงสุด (R27) เรียบร้อยแล้ว
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2 pt-2 border-t border-indigo-500/30 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-300 font-bold">เลือก Rank ที่จะอัพ:</span>
                              <select
                                value={effectiveTargetRank}
                                onChange={(e) => setModalUpgradeTargetRank(Number(e.target.value))}
                                className="bg-slate-950 border border-amber-500/50 rounded-lg px-2 py-1 text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-400 cursor-pointer"
                              >
                                {Array.from({ length: 27 - currentMaxR }, (_, idx) => {
                                  const r = currentMaxR + 1 + idx;
                                  const p = RANK_PRICES_USDT[r - 1] || 10;
                                  return (
                                    <option key={r} value={r}>
                                      Rank {r} ({p.toLocaleString()} USDT)
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                            <span className="text-[10px] text-slate-300 font-mono">
                              หัก Pool:{' '}
                              <strong className="text-amber-400">-{poolDeduct.toFixed(2)} U</strong> • จ่ายส่วนต่าง:{' '}
                              <strong className="text-emerald-400">{netDiffToPay.toFixed(2)} U</strong>
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={isModalUpgrading}
                            onClick={() => handleTriggerModalUpgrade(effectiveTargetRank)}
                            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 hover:from-amber-400 hover:via-orange-400 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-950/60 border border-amber-300/40 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles className="w-4 h-4 text-amber-200 shrink-0" />
                            <span>
                              {isModalUpgrading
                                ? `กำลังอัพเกรด Main ID #${targetMainId} สู่ Rank ${effectiveTargetRank}...`
                                : `🚀 อัพเกรด Main ID #${targetMainId} สู่ Rank ${effectiveTargetRank} (${targetRankPrice.toLocaleString()} USDT)`}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 2: History Filter Tabs inside Popup */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                {[
                  { key: 'all', label: '📋 ดูทั้งหมดครบทุกหมวด' },
                  { key: 'direct30', label: `💵 30% ค่าแนะนำ (${directHistory.length})` },
                  { key: 'level30', label: `🪜 30% ค่าชั้น (${levelHistory.length})` },
                  { key: 'vault35', label: `🏦 35% อัพเกรด (${vaultHistory.length})` },
                  {
                    key: 'auto_extra',
                    label: `🤖 Auto ID (${autoIdsList.length}) • Extra ID (${extraIdsList.length}) • โคลน (${clonesList.length})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setBenefitModalTab(tab.key as any)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                      benefitModalTab === tab.key
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white bg-slate-900/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Section 3: Auto ID, Auto Extra ID & Clone IDs of this ID */}
              {(benefitModalTab === 'all' || benefitModalTab === 'auto_extra') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* Auto IDs in R1 */}
                  <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-3 space-y-2">
                    <div className="font-bold text-amber-300 flex items-center justify-between">
                      <span>🤖 รหัส Auto ID (R1)</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        {autoIdsList.length} รหัส
                      </span>
                    </div>
                    {autoIdsList.length === 0 ? (
                      <div className="text-slate-500 text-[11px]">
                        {modalNode.isAutoMainId
                          ? `รหัสนี้คือ Auto ID #${targetMainId} (เกิดจาก Main #${mainReport?.spawnedByMainId || 1})`
                          : 'ยังไม่มี Auto ID ที่เกิดจากรหัสนี้'}
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-[11px]">
                        {autoIdsList.map((a: any) => (
                          <div
                            key={`modal-auto-${a.id}`}
                            className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center justify-between"
                          >
                            <span className="text-amber-300 font-bold">{a.label}</span>
                            <span className="text-slate-400">
                              ใต้ #{a.parentId} ({a.side})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Auto Extra IDs in R2-R27 */}
                  <div className="bg-slate-950/90 border border-fuchsia-500/30 rounded-xl p-3 space-y-2">
                    <div className="font-bold text-fuchsia-300 flex items-center justify-between">
                      <span>✨ รหัส Auto Extra ID (R2-27)</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300">
                        {extraIdsList.length} รหัส
                      </span>
                    </div>
                    {extraIdsList.length === 0 ? (
                      <div className="text-slate-500 text-[11px]">ยังไม่มี Auto Extra ID ที่เกิดจากรหัสนี้</div>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-[11px]">
                        {extraIdsList.map((ex: any) => (
                          <div
                            key={`modal-extra-${ex.rank}-${ex.id}`}
                            className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center justify-between"
                          >
                            <span className="text-fuchsia-300 font-bold">{ex.label}</span>
                            <span className="text-slate-400">
                              ใต้ R{ex.rank}-#{ex.parentId} ({ex.side})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Clones 100% Rebirth */}
                  <div className="bg-slate-950/90 border border-cyan-500/30 rounded-xl p-3 space-y-2">
                    <div className="font-bold text-cyan-300 flex items-center justify-between">
                      <span>♻️ รหัสโคลน 100% Rebirth</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                        {clonesList.length} รหัส
                      </span>
                    </div>
                    {clonesList.length === 0 ? (
                      <div className="text-slate-500 text-[11px]">ยังไม่มีโคลนที่แตกตัวจากรหัสนี้</div>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-[11px]">
                        {clonesList.map((cl: any) => (
                          <div
                            key={`modal-clone-${cl.rank}-${cl.id}`}
                            className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center justify-between"
                          >
                            <span className="text-cyan-300 font-bold">
                              โคลน R{cl.rank}-#{cl.id} (รอบ {cl.cloneRound})
                            </span>
                            <span className="text-slate-400">
                              ใต้ R{cl.rank}-#{cl.parentId} ({cl.side})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section 4: Commission History Lists (30% Direct / 30% Level / 35% Upgrade Vault) */}
              {benefitModalTab !== 'auto_extra' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                  {/* 30% Direct Referral History */}
                  {(benefitModalTab === 'all' || benefitModalTab === 'direct30') && (
                    <div
                      className={`bg-slate-950/90 border border-emerald-500/30 rounded-xl p-3 space-y-2 ${
                        benefitModalTab === 'direct30' ? 'lg:col-span-3' : ''
                      }`}
                    >
                      <div className="font-bold text-emerald-400 flex items-center justify-between border-b border-slate-800 pb-1.5">
                        <span>💵 ประวัติ 30% ค่าแนะนำ ({directHistory.length} รายการ)</span>
                        <span className="font-mono text-sm">
                          +{(mainReport?.direct30TotalUsdt ?? modalNode.directRewardAllNodes).toFixed(2)} U
                        </span>
                      </div>
                      {directHistory.length === 0 ? (
                        <div className="text-slate-500 py-3 text-center">ยังไม่มีประวัติค่าแนะนำ 30%</div>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 font-mono text-[11px]">
                          {directHistory.map((item: any, idx: number) => (
                            <div
                              key={`md-${idx}`}
                              className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex items-start justify-between gap-2"
                            >
                              <div>
                                <span className="text-amber-300 font-bold">[Rank {item.rank}]</span>{' '}
                                <span className="text-slate-200">{item.note}</span>
                              </div>
                              <span className="text-emerald-400 font-extrabold shrink-0">
                                +{Number(item.amountUsdt).toFixed(2)} U
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 30% Level Bonus History */}
                  {(benefitModalTab === 'all' || benefitModalTab === 'level30') && (
                    <div
                      className={`bg-slate-950/90 border border-cyan-500/30 rounded-xl p-3 space-y-2 ${
                        benefitModalTab === 'level30' ? 'lg:col-span-3' : ''
                      }`}
                    >
                      <div className="font-bold text-cyan-300 flex items-center justify-between border-b border-slate-800 pb-1.5">
                        <span>🪜 ประวัติ 30% ค่าชั้น ({levelHistory.length} รายการ)</span>
                        <span className="font-mono text-sm">
                          +{(mainReport?.level30TotalUsdt ?? modalNode.unilevelRewardAllNodes).toFixed(2)} U
                        </span>
                      </div>
                      {levelHistory.length === 0 ? (
                        <div className="text-slate-500 py-3 text-center">ยังไม่มีประวัติค่าชั้น 2% (15 ชั้น)</div>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 font-mono text-[11px]">
                          {levelHistory.map((item: any, idx: number) => (
                            <div
                              key={`ml-${idx}`}
                              className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex items-start justify-between gap-2"
                            >
                              <div>
                                <span className="text-amber-300 font-bold">[Rank {item.rank}]</span>{' '}
                                <span className="text-slate-200">{item.note}</span>
                              </div>
                              <span className="text-cyan-300 font-extrabold shrink-0">
                                +{Number(item.amountUsdt).toFixed(2)} U
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 35% Upgrade Vault History */}
                  {(benefitModalTab === 'all' || benefitModalTab === 'vault35') && (
                    <div
                      className={`bg-slate-950/90 border border-indigo-500/30 rounded-xl p-3 space-y-2 ${
                        benefitModalTab === 'vault35' ? 'lg:col-span-3' : ''
                      }`}
                    >
                      <div className="font-bold text-indigo-300 flex items-center justify-between border-b border-slate-800 pb-1.5">
                        <span>🏦 ประวัติ 35% อัพเกรด ({vaultHistory.length} รายการ)</span>
                        <span className="font-mono text-sm">
                          สะสม +{(mainReport?.vault35GrossTotalUsdt ?? 0).toFixed(2)} U
                        </span>
                      </div>
                      {vaultHistory.length === 0 ? (
                        <div className="text-slate-500 py-3 text-center">ยังไม่มีประวัติเม็ดซ้ายเข้ากระปุก 35%</div>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 font-mono text-[11px]">
                          {vaultHistory.map((item: any, idx: number) => (
                            <div
                              key={`mv-${idx}`}
                              className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex items-start justify-between gap-2"
                            >
                              <div>
                                <span className="text-amber-300 font-bold">[Rank {item.rank}]</span>{' '}
                                <span className="text-slate-200">{item.note}</span>
                              </div>
                              <span className="text-indigo-300 font-extrabold shrink-0">
                                +{Number(item.amountUsdt).toFixed(2)} U
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Rank Nodes Summary Footer inside Modal */}
              {rankNodesList.length > 0 && (
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-300">
                    📌 ตำแหน่งโหนดของ Main ID #{targetMainId} ในแต่ละแรงค์ (คลิกเพื่อสลับไปดูแรงค์นั้น):
                  </div>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                    {rankNodesList.map((rn: any) => (
                      <button
                        key={`modal-rn-${rn.rank}-${rn.nodeId}`}
                        type="button"
                        onClick={() => {
                          setSelectedRank(rn.rank);
                          setFocusRootId(rn.nodeId);
                          setExpandedBenefitNodeId(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-indigo-950 border border-slate-700 hover:border-indigo-500/50 text-slate-200 transition cursor-pointer"
                      >
                        <strong className="text-amber-300">R{rn.rank}-#{rn.nodeId}</strong> (ใต้ #{rn.parentId}{' '}
                        {rn.side}) • Vault: <span className="text-emerald-400 font-bold">{rn.nodeVault.toFixed(2)}U</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Button Footer */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setExpandedBenefitNodeId(null)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-xs shadow-lg cursor-pointer transition"
                >
                  ปิดหน้าต่างป๊อปอัพ
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
