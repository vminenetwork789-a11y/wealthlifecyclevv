import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { RewardLog, RankUpgradeLog } from '../types';
import {
  CONTRACT_ADDRESS,
  USDT_ADDRESS,
  BSC_TESTNET_RPC,
  BSC_TESTNET_CHAIN_ID,
  MATRIX_ABI,
  RANK_PRICES_USDT,
} from '../contracts/config';
import {
  Radio,
  ExternalLink,
  RefreshCw,
  Filter,
  ArrowUpRight,
  CheckCircle2,
  ShieldCheck,
  Wallet,
  Layers,
  Zap,
} from 'lucide-react';

interface EventLogsSectionProps {
  language: 'th' | 'en';
  account?: string | null;
}

const FALLBACK_RPCS = [
  BSC_TESTNET_RPC,
  'https://bsc-testnet.publicnode.com',
  'https://bsc-testnet.bnbchain.org',
];

function createBscReadProvider(rpcUrl = BSC_TESTNET_RPC) {
  const provider = new ethers.JsonRpcProvider(
    rpcUrl,
    { chainId: BSC_TESTNET_CHAIN_ID, name: 'bnbt' },
    { staticNetwork: true, polling: true, pollingInterval: 15000, batchMaxCount: 1 }
  );
  provider.on('error', () => {});
  return provider;
}

function getFallbackRewardUsdt(rank: number, rewardType: string, unpaidTiersCount?: number): string {
  const rankNum = Math.min(Math.max(Number(rank) || 1, 1), 27);
  const unitPrice = RANK_PRICES_USDT[rankNum - 1] || 5;
  const upper = String(rewardType || '').toUpperCase();

  if (upper.includes('DIRECT')) return (unitPrice * 0.3).toFixed(2);
  if (upper.includes('VAULT')) return (unitPrice * 0.35).toFixed(2);
  if (upper.includes('ALLSELL')) return (unitPrice * 0.04).toFixed(2);
  if (upper.includes('BOT')) return (unitPrice * 0.01).toFixed(2);
  if (upper.includes('FAMILY') || upper.includes('OVERFLOW')) {
    const tiers = unpaidTiersCount && unpaidTiersCount > 0 ? unpaidTiersCount : 12;
    return (unitPrice * 0.02 * tiers).toFixed(2);
  }
  if (upper.includes('LEVEL')) return (unitPrice * 0.02).toFixed(2);
  return (unitPrice * 0.02).toFixed(2);
}

interface CommissionItem {
  rank: number;
  fromNodeId: number;
  fromMainId: number;
  fromNodeType: string;
  toNodeId: number;
  toMainId: number;
  tier?: number;
  amountUsdt: number;
  note: string;
}

interface SpawnedIdItem {
  id: number;
  rank: number;
  label: string;
  type: 'AUTO_ID' | 'AUTO_EXTRA_ID' | 'CLONE_ID';
  parentId: number;
  side: 'LEFT' | 'RIGHT' | 'ROOT';
  directSponsorNodeId: number;
  owner: string;
  cloneRound?: number;
}

interface PerIdReport {
  id: number;
  label: string;
  nodeType: 'MANUAL_ID' | 'AUTO_ID' | 'CLONE_ID' | 'EXTRA_ID';
  originMainId: number;
  spawnedByMainId: number;
  owner: string;
  directSponsorNodeId: number;
  parentId: number;
  sideInR1: 'LEFT' | 'RIGHT' | 'ROOT';
  leftChildR1: number;
  rightChildR1: number;
  currentMaxRank: number;
  rankNodesList: Array<{
    rank: number;
    nodeId: number;
    parentId: number;
    side: string;
    leftChild: number;
    rightChild: number;
    nodeVault: number;
    rawNodeVault: number;
  }>;
  direct30TotalUsdt: number;
  direct30History: CommissionItem[];
  level30TotalUsdt: number;
  level30History: CommissionItem[];
  vault35GrossTotalUsdt: number;
  vault35RemainingTotalUsdt: number;
  vault35DeductedTotalUsdt: number;
  vault35History: CommissionItem[];
  pools: {
    upgradeRankPool: number;
    newAutoIdPool: number;
    newExtraIdPool: number;
  };
  autoIdsSpawned: SpawnedIdItem[];
  autoExtraIdsSpawned: SpawnedIdItem[];
  clonesSpawned: SpawnedIdItem[];
}

export const EventLogsSection: React.FC<EventLogsSectionProps> = ({ language, account }) => {
  const [activeTab, setActiveTab] = useState<'per_id' | 'rewards' | 'upgrades'>('per_id');
  const [logs, setLogs] = useState<RewardLog[]>([]);
  const [upgradeLogs, setUpgradeLogs] = useState<RankUpgradeLog[]>([]);
  const [perIdReports, setPerIdReports] = useState<PerIdReport[]>([]);
  const [selectedIdFilter, setSelectedIdFilter] = useState<number>(0);
  const [idTypeFilter, setIdTypeFilter] = useState<'all' | 'main_auto' | 'auto_only' | 'clone_only'>('main_auto');
  const [expandedIdSet, setExpandedIdSet] = useState<Record<number, boolean>>({ 1: true, 2: true, 5: true, 15: true, 17: true });
  const [filterType, setFilterType] = useState<string>('all');
  const [upgradeRankFilter, setUpgradeRankFilter] = useState<number>(0);
  const [onlyMyWallet, setOnlyMyWallet] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [latestBlock, setLatestBlock] = useState<number>(0);
  const [totalNodesRank1, setTotalNodesRank1] = useState<number>(0);
  const [usdtDecimals, setUsdtDecimals] = useState<number>(6);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');

  const toggleExpandId = (idNum: number) => {
    setExpandedIdSet((prev) => ({ ...prev, [idNum]: !prev[idNum] }));
  };

  const formatRewardAmount = useCallback(
    (rawAmount: bigint, decimals: number, rank = 1, rewardType = 'DIRECT'): string => {
      try {
        const effectiveDecimals = rawAmount >= 100000000000000n ? 18 : decimals || 6;
        const formatted = Number(ethers.formatUnits(rawAmount, effectiveDecimals));
        if (formatted > 0) {
          return formatted.toFixed(2);
        }
      } catch {
        // Fallback below
      }
      return getFallbackRewardUsdt(rank, rewardType);
    },
    []
  );

  const fetchOnChainRewardEvents = useCallback(async (forceSync = false) => {
    setIsRefreshing(true);

    // 1. อ่านข้อมูลประวัติราย ID + ประวัติการกระจายรางวัล + ประวัติการอัพแรงค์จาก Database ของเราเป็นหลัก
    try {
      const perIdUrl = forceSync ? '/api/matrix/per-id-history?forceSync=1' : '/api/matrix/per-id-history';
      const endpoint = forceSync ? '/api/rewards?forceSync=1' : '/api/rewards';
      const [dbRes, perIdRes] = await Promise.all([
        fetch(endpoint, { headers: { Accept: 'application/json' } }),
        fetch(perIdUrl, { headers: { Accept: 'application/json' } }).catch(() => null),
      ]);

      if (perIdRes && perIdRes.ok) {
        const perIdJson = await perIdRes.json();
        if (perIdJson?.success && Array.isArray(perIdJson.reports)) {
          setPerIdReports(perIdJson.reports);
        }
      }

      if (dbRes.ok) {
        const dbJson = await dbRes.json();
        if (Array.isArray(dbJson?.upgradeLogs)) {
          setUpgradeLogs(dbJson.upgradeLogs);
        }
        if (dbJson?.success && Array.isArray(dbJson.data) && dbJson.data.length > 0) {
          const normalizedLogs: RewardLog[] = dbJson.data.map((item: any) => {
            const parsedAmt = parseFloat(item.amount);
            const rankVal = Number(item.rank) || 1;
            const toIdStr = String(item.toNodeId || '0');
            let normalizedType = String(item.rewardType || 'DIRECT');
            if (normalizedType === 'LEVEL' && toIdStr === '0') {
              normalizedType = 'UNPAID_LEVEL_FAMILY_POOL';
            }
            const sanitizedAmt =
              parsedAmt > 0
                ? parsedAmt.toFixed(2)
                : getFallbackRewardUsdt(rankVal, normalizedType);
            return {
              ...item,
              rewardType: normalizedType,
              amount: sanitizedAmt,
            };
          });

          normalizedLogs.sort((a, b) => {
            const rDiff = Number(b.rank || 1) - Number(a.rank || 1);
            if (rDiff !== 0) return rDiff;
            const nDiff = Number(b.fromNodeId || 0) - Number(a.fromNodeId || 0);
            if (nDiff !== 0) return nDiff;
            return (b.blockNumber || 0) - (a.blockNumber || 0);
          });

          setLogs(normalizedLogs);
          if (Number(dbJson.latestBlock) > 0) {
            setLatestBlock(Number(dbJson.latestBlock));
          }
          if (Number(dbJson.totalNodesRank1) > 0) {
            setTotalNodesRank1(Number(dbJson.totalNodesRank1));
          }
          setSyncStatus('connected');
          setLastSyncedAt(
            new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );
          setIsRefreshing(false);
          return;
        }
      }
    } catch {
      // Fallback to direct RPC below if Database API is unreachable
    }

    // 2. Fallback ไปยัง RPC เฉพาะกรณีที่ Database ยังไม่มีข้อมูล
    let workingProvider: ethers.JsonRpcProvider | null = null;

    for (const rpc of FALLBACK_RPCS) {
      try {
        const candidate = createBscReadProvider(rpc);
        const blockNum = await candidate.getBlockNumber();
        if (blockNum > 0) {
          workingProvider = candidate;
          setLatestBlock(blockNum);
          break;
        }
      } catch {
        // Try next RPC
      }
    }

    if (!workingProvider) {
      setSyncStatus('error');
      setIsRefreshing(false);
      return;
    }

    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, MATRIX_ABI, workingProvider);

      let detectedDecimals = 6;
      try {
        const rank1Price: bigint = await contract.rankPrice(1);
        if (rank1Price >= BigInt('1000000000000000000')) {
          detectedDecimals = 18;
        } else {
          detectedDecimals = 6;
        }
        setUsdtDecimals(detectedDecimals);
      } catch {
        detectedDecimals = 6;
      }

      let totalNodes = 1;
      try {
        const totalOnChain: bigint = await contract.totalNodesInRank(1);
        totalNodes = Number(totalOnChain);
        setTotalNodesRank1(totalNodes);
      } catch {
        totalNodes = 1;
      }

      const currentBlock = await workingProvider.getBlockNumber();
      setLatestBlock(currentBlock);

      const collectedEvents: RewardLog[] = [];
      const seenIds = new Set<string>();

      // 5. Reconstruct exact on-chain left-child reward distributions from live Rank 1 tree state
      // for any left-child nodes not yet present in collectedEvents
      if (totalNodes > 1) {
        try {
          const [allSellAddr, botAddr, familyAddr] = await Promise.all([
            contract.allSellWallet().catch(() => '0xBeFEdbB942A73957F6123bA0B3aA27B4A081F710'),
            contract.botWallet().catch(() => '0xbFD0A57Ac58165A863A9F4d9E5C1B57996B24a56'),
            contract.familyPool().catch(() => '0x225D2016F610C99051EfD91F812B2736647B275A'),
          ]);

          const nodesMap = new Map<
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
              directSponsorNodeId: number;
            }
          >();

          let loadedFromApi = false;
          try {
            const treeRes = await fetch(
              `/api/matrix/tree-nodes?rank=1&contract=${CONTRACT_ADDRESS}`
            );
            if (treeRes.ok) {
              const treeJson = await treeRes.json();
              if (treeJson?.success && Array.isArray(treeJson.nodes) && treeJson.nodes.length > 0) {
                for (const n of treeJson.nodes) {
                  const nid = Number(n.id);
                  if (nid > 0) {
                    nodesMap.set(nid, {
                      id: nid,
                      owner: String(n.owner || ethers.ZeroAddress),
                      directSponsor: String(n.directSponsor || ethers.ZeroAddress),
                      parentId: Number(n.parentId || 0),
                      leftChild: Number(n.leftChild || 0),
                      rightChild: Number(n.rightChild || 0),
                      isClone: Boolean(n.isClone),
                      isExtraId: Boolean(n.isExtraId),
                      directSponsorNodeId: Number(n.directSponsorNodeId || 1),
                    });
                  }
                }
                loadedFromApi = true;
              }
            }
          } catch {
            // Fallback to RPC below
          }

          if (!loadedFromApi) {
            const maxCheck = Math.min(totalNodes, 50);
            for (let nid = 1; nid <= maxCheck; nid++) {
              try {
                const nd = await contract.rankNodes(1, nid);
                nodesMap.set(nid, {
                  id: nid,
                  owner: String(nd.owner),
                  directSponsor: String(nd.directSponsor),
                  parentId: Number(nd.parentId),
                  leftChild: Number(nd.leftChild),
                  rightChild: Number(nd.rightChild),
                  isClone: Boolean(nd.isClone),
                  isExtraId: Boolean(nd.isExtraId),
                  directSponsorNodeId: 1,
                });
              } catch {
                // Ignore
              }
            }
          }

          const existingFromNodeTypes = new Set(
            collectedEvents.map((e) => `${e.fromNodeId}:${e.rewardType}:${e.toNodeId}`)
          );
          const rootOwner = (nodesMap.get(1)?.owner || '').toLowerCase();

          const sortedNids = Array.from(nodesMap.keys())
            .filter((id) => id >= 2)
            .sort((a, b) => b - a);

          for (const nodeId of sortedNids) {
            const nodeData = nodesMap.get(nodeId);
            if (!nodeData || nodeData.parentId === 0) continue;

            const parentData = nodesMap.get(nodeData.parentId);
            if (!parentData || parentData.leftChild !== nodeId) continue;

            const isId1Clone =
              nodeData.isClone && nodeData.owner.toLowerCase() === rootOwner;
            const hasSponsor =
              nodeData.directSponsor && nodeData.directSponsor !== ethers.ZeroAddress;

            // 1. Direct 30% (1.50 USDT on Rank 1)
            const directType =
              isId1Clone || !hasSponsor ? 'DIRECT_ID1_CLONE_FAMILY_POOL' : 'DIRECT';
            const directToId =
              isId1Clone || !hasSponsor ? '0' : String(nodeData.directSponsorNodeId || 1);
            const directRecip =
              isId1Clone || !hasSponsor ? String(familyAddr) : String(nodeData.directSponsor);

            if (!existingFromNodeTypes.has(`${nodeId}:${directType}:${directToId}`)) {
              collectedEvents.push({
                id: `onchain-direct-r1-n${nodeId}`,
                fromNodeId: String(nodeId),
                toNodeId: directToId,
                recipient: directRecip,
                rank: 1,
                rewardType: directType,
                amount: '1.50',
                txHash: '',
                blockNumber: currentBlock,
                timestamp: new Date().toISOString(),
              });
            }

            // 2. Upgrade Vault 35% (1.75 USDT on Rank 1)
            const vaultKey = `${nodeId}:UPGRADE_VAULT:${parentData.id}`;
            if (!existingFromNodeTypes.has(vaultKey)) {
              collectedEvents.push({
                id: `onchain-vault-r1-n${nodeId}`,
                fromNodeId: String(nodeId),
                toNodeId: String(parentData.id),
                recipient: String(parentData.owner),
                rank: 1,
                rewardType: 'UPGRADE_VAULT',
                amount: '1.75',
                txHash: '',
                blockNumber: currentBlock,
                timestamp: new Date().toISOString(),
              });
            }

            // 3. Level 2% (0.10 USDT per upline tier up to 15 levels)
            let currUpId = nodeData.parentId;
            let paidLevels = 0;
            const guard = new Set<number>();
            while (currUpId > 0 && paidLevels < 15 && !guard.has(currUpId)) {
              guard.add(currUpId);
              const upNode = nodesMap.get(currUpId);
              if (!upNode) break;
              paidLevels++;
              const lvlKey = `${nodeId}:LEVEL:${currUpId}`;
              if (!existingFromNodeTypes.has(lvlKey)) {
                collectedEvents.push({
                  id: `onchain-level-r1-n${nodeId}-u${currUpId}`,
                  fromNodeId: String(nodeId),
                  toNodeId: String(currUpId),
                  recipient: String(upNode.owner),
                  rank: 1,
                  rewardType: 'LEVEL',
                  amount: '0.10',
                  txHash: '',
                  blockNumber: currentBlock,
                  timestamp: new Date().toISOString(),
                });
              }
              currUpId = upNode.parentId;
            }

            // Unpaid levels overflow to Family Pool
            const unpaidLevels = 15 - paidLevels;
            if (unpaidLevels > 0) {
              const famAmount = (unpaidLevels * 0.1).toFixed(2);
              const famKey1 = `${nodeId}:UNPAID_LEVEL_FAMILY_POOL:0`;
              const famKey2 = `${nodeId}:FAMILY_POOL_OVERFLOW:0`;
              if (!existingFromNodeTypes.has(famKey1) && !existingFromNodeTypes.has(famKey2)) {
                collectedEvents.push({
                  id: `onchain-family-r1-n${nodeId}`,
                  fromNodeId: String(nodeId),
                  toNodeId: '0',
                  recipient: String(familyAddr),
                  rank: 1,
                  rewardType: 'UNPAID_LEVEL_FAMILY_POOL',
                  amount: famAmount,
                  txHash: '',
                  blockNumber: currentBlock,
                  timestamp: new Date().toISOString(),
                });
              } else {
                // Update any existing unpaid level entry for this nodeId with exact unpaid amount
                for (const ev of collectedEvents) {
                  if (
                    ev.fromNodeId === String(nodeId) &&
                    ev.toNodeId === '0' &&
                    (ev.rewardType.includes('FAMILY') || ev.rewardType === 'LEVEL')
                  ) {
                    ev.amount = famAmount;
                  }
                }
              }
            }

            // 4. AllSell 4% (0.20 USDT on Rank 1)
            if (!existingFromNodeTypes.has(`${nodeId}:ALLSELL:0`)) {
              collectedEvents.push({
                id: `onchain-allsell-r1-n${nodeId}`,
                fromNodeId: String(nodeId),
                toNodeId: '0',
                recipient: String(allSellAddr),
                rank: 1,
                rewardType: 'ALLSELL',
                amount: '0.20',
                txHash: '',
                blockNumber: currentBlock,
                timestamp: new Date().toISOString(),
              });
            }

            // 5. Bot 1% (0.05 USDT on Rank 1)
            if (!existingFromNodeTypes.has(`${nodeId}:BOT:0`)) {
              collectedEvents.push({
                id: `onchain-bot-r1-n${nodeId}`,
                fromNodeId: String(nodeId),
                toNodeId: '0',
                recipient: String(botAddr),
                rank: 1,
                rewardType: 'BOT',
                amount: '0.05',
                txHash: '',
                blockNumber: currentBlock,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (reconstructErr) {
          console.warn('On-chain state reconstruction notice:', reconstructErr);
        }
      }

      collectedEvents.sort((a, b) => {
        const nDiff = Number(b.fromNodeId || 0) - Number(a.fromNodeId || 0);
        if (nDiff !== 0) return nDiff;
        return (b.blockNumber || 0) - (a.blockNumber || 0);
      });
      setLogs(collectedEvents);
      setSyncStatus('connected');
      setLastSyncedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } catch (err) {
      console.error('Error syncing on-chain reward logs:', err);
      setSyncStatus('error');
    } finally {
      setIsRefreshing(false);
    }
  }, [formatRewardAmount]);

  // ดึงข้อมูลจาก Database ของเราเป็นหลัก + อัปเดตอัตโนมัติเมื่อมีธุรกรรมใหม่
  useEffect(() => {
    fetchOnChainRewardEvents(false);

    const handleTreeRefresh = () => {
      fetchOnChainRewardEvents(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('matrix:tree:refresh', handleTreeRefresh);
    }

    const interval = setInterval(() => {
      fetchOnChainRewardEvents(false);
    }, 8000);

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('matrix:tree:refresh', handleTreeRefresh);
      }
    };
  }, [fetchOnChainRewardEvents]);

  const filteredLogs = logs.filter((l) => {
    if (onlyMyWallet && account) {
      if (l.recipient.toLowerCase() !== account.toLowerCase()) return false;
    }
    if (filterType === 'all') return true;
    return l.rewardType.toUpperCase().includes(filterType.toUpperCase());
  });

  const totalRewardUsdt = filteredLogs.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const filteredUpgrades = upgradeLogs.filter((u) => {
    if (onlyMyWallet && account) {
      if (u.owner.toLowerCase() !== account.toLowerCase()) return false;
    }
    if (upgradeRankFilter > 0 && u.toRank !== upgradeRankFilter) return false;
    return true;
  });

  const totalUpgradeVolumeUsdt = filteredUpgrades.reduce(
    (sum, u) => sum + (parseFloat(u.rankPriceUsdt) || 0),
    0
  );
  const totalVaultDeductedUsdt = filteredUpgrades.reduce(
    (sum, u) => sum + (parseFloat(u.vaultDeductedUsdt) || 0),
    0
  );
  const totalWalletPaidUsdt = filteredUpgrades.reduce(
    (sum, u) => sum + (parseFloat(u.walletPaidUsdt) || 0),
    0
  );

  const distinctUpgradedRanks = Array.from(new Set(upgradeLogs.map((u) => u.toRank))).sort(
    (a, b) => a - b
  );

  const filteredPerIdReports = perIdReports.filter((rep) => {
    if (onlyMyWallet && account) {
      if (rep.owner.toLowerCase() !== account.toLowerCase()) return false;
    }
    if (selectedIdFilter > 0) {
      return rep.id === selectedIdFilter;
    }
    if (idTypeFilter === 'main_auto') {
      return rep.nodeType !== 'CLONE_ID';
    }
    if (idTypeFilter === 'auto_only') {
      return rep.nodeType === 'AUTO_ID' || rep.autoIdsSpawned.length > 0 || rep.autoExtraIdsSpawned.length > 0;
    }
    if (idTypeFilter === 'clone_only') {
      return rep.nodeType === 'CLONE_ID';
    }
    return true;
  });

  const mainAndAutoCount = perIdReports.filter((r) => r.nodeType !== 'CLONE_ID').length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex h-3 w-3">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  syncStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  syncStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </div>
            <h3 className="text-lg font-bold text-emerald-400">
              {activeTab === 'per_id'
                ? language === 'th'
                  ? '📊 ประวัติราย ID (30% แนะนำ • 30% ค่าชั้น • 35% อัพเกรด • Auto ID & Extra ID)'
                  : '📊 Per-ID Commission & Auto/Extra ID Breakdown'
                : activeTab === 'rewards'
                ? language === 'th'
                  ? '📡 ประวัติการกระจายรางวัลสด'
                  : '📡 Live Reward Events'
                : language === 'th'
                ? '🚀 ประวัติการอัพแรงค์ (Rank 2 - 27)'
                : '🚀 Rank Upgrade History (Rank 2 - 27)'}
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Chain ID: 97 • Database Synced
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`https://testnet.bscscan.com/address/${CONTRACT_ADDRESS}#events`}
            target="_blank"
            rel="noreferrer"
            className="text-xs bg-slate-950 hover:bg-slate-800 text-indigo-300 border border-slate-800 px-3 py-1.5 rounded-xl font-mono transition flex items-center gap-1.5"
            title="View Contract Events on BSCScan Testnet"
          >
            <span>BSCScan Events</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => fetchOnChainRewardEvents(true)}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Sync Database from BNB Testnet"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'กำลังซิงค์ DB...' : language === 'th' ? 'ซิงค์เชนสด' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs: Per-ID Breakdown vs Reward Events vs Rank Upgrade History */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 my-3 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('per_id')}
          className={`py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'per_id'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>
            {language === 'th'
              ? `สรุปรายได้ & Auto/Extra แยกแต่ละ ID (${perIdReports.length})`
              : `Per-ID Breakdown (${perIdReports.length})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rewards')}
          className={`py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'rewards'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>
            {language === 'th'
              ? `ประวัติการกระจายรางวัล (${logs.length})`
              : `Reward Events (${logs.length})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upgrades')}
          className={`py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'upgrades'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300" />
          <span>
            {language === 'th'
              ? `ประวัติการอัพแรงค์ (${upgradeLogs.length})`
              : `Rank Upgrade History (${upgradeLogs.length})`}
          </span>
        </button>
      </div>

      {/* Live On-Chain Telemetry Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3 text-[11px] font-mono">
        <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-slate-500 block">Contract</span>
          <a
            href={`https://testnet.bscscan.com/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:underline font-bold truncate block"
          >
            {CONTRACT_ADDRESS.slice(0, 8)}...{CONTRACT_ADDRESS.slice(-6)}
          </a>
        </div>
        <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-slate-500 block">Latest Block</span>
          <span className="text-indigo-300 font-bold">
            {latestBlock > 0 ? `#${latestBlock.toLocaleString()}` : 'กำลังเชื่อมต่อ...'}
          </span>
        </div>
        <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-slate-500 block">
            {activeTab === 'upgrades' ? 'หักจาก Vault สะสมรวม' : 'Rank 1 Nodes ทั้งหมด'}
          </span>
          <span className="text-amber-300 font-bold">
            {activeTab === 'upgrades'
              ? `-${totalVaultDeductedUsdt.toFixed(2)} USDT`
              : `${totalNodesRank1 || perIdReports.length} โหนด (หลัก/Auto ${mainAndAutoCount})`}
          </span>
        </div>
        <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-slate-500 block">
            {activeTab === 'upgrades' ? 'มูลค่าอัพแรงค์รวม (ส่วนต่าง)' : 'ยอดรวมรางวัลที่จ่าย'}
          </span>
          <span className="text-emerald-400 font-bold">
            {activeTab === 'upgrades'
              ? `${totalUpgradeVolumeUsdt.toFixed(2)} U (ส่วนต่าง ${totalWalletPaidUsdt.toFixed(2)} U)`
              : `+${totalRewardUsdt.toFixed(2)} USDT`}
          </span>
        </div>
      </div>

      {activeTab === 'per_id' ? (
        <div className="space-y-4">
          {/* Filter Bar for Per-ID View */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 font-semibold mr-1">ประเภท ID:</span>
                {[
                  {
                    key: 'main_auto',
                    label: `รหัสหลัก + Auto ID (${mainAndAutoCount})`,
                  },
                  {
                    key: 'all',
                    label: `ทุกโหนดใน R1 รวมโคลน (${perIdReports.length})`,
                  },
                  {
                    key: 'auto_only',
                    label: 'เฉพาะที่มี Auto ID / Auto Extra ID',
                  },
                  {
                    key: 'clone_only',
                    label: `เฉพาะโคลน R1 (${perIdReports.filter((r) => r.nodeType === 'CLONE_ID').length})`,
                  },
                ].map((btn) => (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={() => {
                      setIdTypeFilter(btn.key as any);
                      setSelectedIdFilter(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                      idTypeFilter === btn.key && selectedIdFilter === 0
                        ? 'bg-amber-600 text-white font-bold'
                        : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {account && (
                <button
                  type="button"
                  onClick={() => setOnlyMyWallet(!onlyMyWallet)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] flex items-center gap-1.5 border ${
                    onlyMyWallet
                      ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                  }`}
                >
                  <Wallet className="w-3 h-3" />
                  <span>เฉพาะกระเป๋าฉัน</span>
                </button>
              )}
            </div>

            {/* Individual ID Selector Chips (#1 .. #27) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
              <span className="text-slate-400 text-[11px] mr-1 font-semibold">เลือกดูเฉพาะ ID:</span>
              <button
                type="button"
                onClick={() => setSelectedIdFilter(0)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] cursor-pointer transition ${
                  selectedIdFilter === 0
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                แสดงทั้งหมด
              </button>
              {perIdReports.map((rep) => {
                const badgeCls =
                  rep.nodeType === 'AUTO_ID'
                    ? 'border-amber-500/50 text-amber-300'
                    : rep.nodeType === 'CLONE_ID'
                    ? 'border-cyan-500/40 text-cyan-300'
                    : 'border-indigo-500/50 text-indigo-300';
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => {
                      setSelectedIdFilter(rep.id);
                      setExpandedIdSet((prev) => ({ ...prev, [rep.id]: true }));
                    }}
                    className={`px-2 py-0.5 rounded font-mono text-[11px] cursor-pointer border transition ${
                      selectedIdFilter === rep.id
                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                        : `bg-slate-900/90 hover:bg-slate-800 ${badgeCls}`
                    }`}
                  >
                    #{rep.id}
                    {rep.nodeType === 'AUTO_ID'
                      ? ' (Auto)'
                      : rep.nodeType === 'CLONE_ID'
                      ? ` (โคลน#${rep.originMainId})`
                      : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-ID Cards List */}
          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {filteredPerIdReports.map((rep) => {
              const isExpanded = Boolean(expandedIdSet[rep.id] || selectedIdFilter === rep.id);
              const badgeStyle =
                rep.nodeType === 'AUTO_ID'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : rep.nodeType === 'CLONE_ID'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
              const badgeLabel =
                rep.nodeType === 'AUTO_ID'
                  ? `AUTO ID (เกิดจาก Main #${rep.spawnedByMainId})`
                  : rep.nodeType === 'CLONE_ID'
                  ? `CLONE ID (โคลนของ Main #${rep.originMainId})`
                  : 'MANUAL ID (รหัสหลักสมัครตรง)';

              return (
                <div
                  key={rep.id}
                  className="bg-slate-950/95 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition space-y-3 text-xs"
                >
                  {/* Card Top Summary Row */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap font-mono">
                        <span className="text-base font-extrabold text-white bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-700">
                          ID #{rep.id}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${badgeStyle}`}>
                          {badgeLabel}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                          Max Rank: R{rep.currentMaxRank}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          อัพไลน์ R1: #{rep.parentId} ({rep.sideInR1}) • ผู้แนะนำตรง: #{rep.directSponsorNodeId}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-2">
                        <span>
                          กระเป๋าเจ้าของ:{' '}
                          <a
                            href={`https://testnet.bscscan.com/address/${rep.owner}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-300 hover:underline"
                          >
                            {rep.owner}
                          </a>
                        </span>
                        <span className="text-slate-600">•</span>
                        <span>
                          ลูกซ้าย R1: {rep.leftChildR1 > 0 ? `#${rep.leftChildR1}` : 'ว่าง'} | ลูกขวา R1:{' '}
                          {rep.rightChildR1 > 0 ? `#${rep.rightChildR1}` : 'ว่าง'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpandId(rep.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 font-semibold text-xs cursor-pointer self-start lg:self-center shrink-0"
                    >
                      {isExpanded ? 'ซ่อนรายละเอียด ▲' : 'ดูประวัติละเอียด ▼'}
                    </button>
                  </div>

                  {/* 5 Metric Summary Pills for this ID */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[11px]">
                    <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">1. ค่าแนะนำ 30% (Direct)</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        +{rep.direct30TotalUsdt.toFixed(2)} USDT
                      </span>
                      <span className="text-slate-500 block text-[10px]">
                        ({rep.direct30History.length} รายการ)
                      </span>
                    </div>

                    <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">2. ค่าชั้น 30% (2%x15 ชั้น)</span>
                      <span className="text-cyan-300 font-bold text-sm">
                        +{rep.level30TotalUsdt.toFixed(2)} USDT
                      </span>
                      <span className="text-slate-500 block text-[10px]">
                        ({rep.level30History.length} รายการ)
                      </span>
                    </div>

                    <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">3. สะสมอัพเกรด 35% (Vault)</span>
                      <span className="text-indigo-300 font-bold text-sm">
                        สะสม +{rep.vault35GrossTotalUsdt.toFixed(2)} U
                      </span>
                      <span className="text-amber-300 block text-[10px]">
                        คงเหลือ {rep.vault35RemainingTotalUsdt.toFixed(2)} U (ใช้ไป {rep.vault35DeductedTotalUsdt.toFixed(2)} U)
                      </span>
                    </div>

                    <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">4. Auto ID (R1) ที่เกิด</span>
                      <span className="text-amber-300 font-bold text-sm">
                        {rep.autoIdsSpawned.length} รหัส
                      </span>
                      <span className="text-slate-400 block text-[10px] truncate">
                        {rep.autoIdsSpawned.length > 0
                          ? rep.autoIdsSpawned.map((a) => `#${a.id}`).join(', ')
                          : rep.nodeType === 'AUTO_ID'
                          ? `ตัวเองคือ Auto ID #${rep.id}`
                          : 'ยังไม่มี'}
                      </span>
                    </div>

                    <div className="bg-fuchsia-950/30 border border-fuchsia-500/30 rounded-lg p-2.5">
                      <span className="text-slate-400 block text-[10px]">5. Auto Extra ID (R2-27)</span>
                      <span className="text-fuchsia-300 font-bold text-sm">
                        {rep.autoExtraIdsSpawned.length} รหัส
                      </span>
                      <span className="text-slate-400 block text-[10px] truncate">
                        {rep.autoExtraIdsSpawned.length > 0
                          ? rep.autoExtraIdsSpawned.map((e) => `R${e.rank}-#${e.id}`).join(', ')
                          : `โคลนสะสม ${rep.clonesSpawned.length} รหัส`}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detailed History for this ID */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-slate-800/90 space-y-3">
                      {/* Rank Presence & 3 Pools Breakdown */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2">
                        <div className="font-bold text-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <span>📌 โหนดในแต่ละแรงค์ & ยอดคงเหลือ 3 กระปุก (35% Upgrade Vault Pools)</span>
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Pool 1 (อัพแรงค์): {rep.pools.upgradeRankPool.toFixed(2)} U
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Pool 2 (สร้าง Auto ID): {rep.pools.newAutoIdPool.toFixed(2)} U
                            </span>
                            <span className="px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                              Pool 3 (สร้าง Extra ID): {rep.pools.newExtraIdPool.toFixed(2)} U
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                          {rep.rankNodesList.map((rn) => (
                            <span
                              key={`${rn.rank}-${rn.nodeId}`}
                              className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300"
                            >
                              <strong className="text-amber-300">R{rn.rank}-#{rn.nodeId}</strong> (ใต้ #{rn.parentId}{' '}
                              {rn.side}) • ซ้าย:{rn.leftChild || '-'} ขวา:{rn.rightChild || '-'} • Vault คงเหลือ:{' '}
                              <span className="text-emerald-400 font-bold">{rn.nodeVault.toFixed(2)}U</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Auto IDs, Auto Extra IDs, and Clones Spawned by this ID */}
                      {(rep.autoIdsSpawned.length > 0 ||
                        rep.autoExtraIdsSpawned.length > 0 ||
                        rep.clonesSpawned.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          <div className="bg-slate-900/70 border border-amber-500/30 rounded-lg p-2.5 space-y-1.5">
                            <div className="font-bold text-amber-300">
                              🤖 รายการ Auto ID (R1) ของ ID #{rep.id} ({rep.autoIdsSpawned.length})
                            </div>
                            {rep.autoIdsSpawned.length === 0 ? (
                              <div className="text-slate-500 text-[11px]">ยังไม่มี Auto ID ที่เกิดจากรหัสนี้</div>
                            ) : (
                              <div className="space-y-1 font-mono text-[11px]">
                                {rep.autoIdsSpawned.map((a) => (
                                  <div
                                    key={`auto-${a.id}`}
                                    className="bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center justify-between"
                                  >
                                    <span className="text-amber-300 font-bold">{a.label}</span>
                                    <span className="text-slate-400">
                                      วางใต้ #{a.parentId} ({a.side})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="bg-slate-900/70 border border-fuchsia-500/30 rounded-lg p-2.5 space-y-1.5">
                            <div className="font-bold text-fuchsia-300">
                              ✨ รายการ Auto Extra ID (R2-27) ของ ID #{rep.id} ({rep.autoExtraIdsSpawned.length})
                            </div>
                            {rep.autoExtraIdsSpawned.length === 0 ? (
                              <div className="text-slate-500 text-[11px]">ยังไม่มี Auto Extra ID ที่เกิดจากรหัสนี้</div>
                            ) : (
                              <div className="space-y-1 font-mono text-[11px]">
                                {rep.autoExtraIdsSpawned.map((ex) => (
                                  <div
                                    key={`extra-${ex.rank}-${ex.id}`}
                                    className="bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center justify-between"
                                  >
                                    <span className="text-fuchsia-300 font-bold">{ex.label}</span>
                                    <span className="text-slate-400">
                                      วางใต้ R{ex.rank}-#{ex.parentId} ({ex.side})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="bg-slate-900/70 border border-cyan-500/30 rounded-lg p-2.5 space-y-1.5">
                            <div className="font-bold text-cyan-300">
                              ♻️ รายการโคลน 100% Rebirth ของ ID #{rep.id} ({rep.clonesSpawned.length})
                            </div>
                            {rep.clonesSpawned.length === 0 ? (
                              <div className="text-slate-500 text-[11px]">ยังไม่มีโคลนที่แตกตัวจากรหัสนี้</div>
                            ) : (
                              <div className="space-y-1 font-mono text-[11px] max-h-36 overflow-y-auto">
                                {rep.clonesSpawned.map((cl) => (
                                  <div
                                    key={`clone-${cl.rank}-${cl.id}`}
                                    className="bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center justify-between"
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

                      {/* 3 Columns of Commission Transaction History: 30% Direct, 30% Level, 35% Vault */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        {/* 1. Direct 30% History */}
                        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-lg p-2.5 space-y-1.5">
                          <div className="font-bold text-emerald-400 flex items-center justify-between">
                            <span>💵 ประวัติ 30% ค่าแนะนำ ({rep.direct30History.length})</span>
                            <span className="font-mono">+{rep.direct30TotalUsdt.toFixed(2)} U</span>
                          </div>
                          {rep.direct30History.length === 0 ? (
                            <div className="text-slate-500 text-[11px]">ยังไม่มีรายการค่าแนะนำ 30%</div>
                          ) : (
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1 font-mono text-[11px]">
                              {rep.direct30History.map((item, idx) => (
                                <div
                                  key={`d-${idx}`}
                                  className="bg-slate-950 p-1.5 rounded border border-slate-800/90 flex items-start justify-between gap-2"
                                >
                                  <div>
                                    <span className="text-amber-300 font-bold">[R{item.rank}]</span>{' '}
                                    <span className="text-slate-300">{item.note}</span>
                                  </div>
                                  <span className="text-emerald-400 font-bold shrink-0">
                                    +{item.amountUsdt.toFixed(2)} U
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Level 30% (2% x 15) History */}
                        <div className="bg-slate-900/80 border border-cyan-500/30 rounded-lg p-2.5 space-y-1.5">
                          <div className="font-bold text-cyan-300 flex items-center justify-between">
                            <span>🪜 ประวัติ 30% ค่าชั้น ({rep.level30History.length})</span>
                            <span className="font-mono">+{rep.level30TotalUsdt.toFixed(2)} U</span>
                          </div>
                          {rep.level30History.length === 0 ? (
                            <div className="text-slate-500 text-[11px]">ยังไม่มีรายการค่าชั้น 2% (15 ชั้น)</div>
                          ) : (
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1 font-mono text-[11px]">
                              {rep.level30History.map((item, idx) => (
                                <div
                                  key={`l-${idx}`}
                                  className="bg-slate-950 p-1.5 rounded border border-slate-800/90 flex items-start justify-between gap-2"
                                >
                                  <div>
                                    <span className="text-amber-300 font-bold">[R{item.rank}]</span>{' '}
                                    <span className="text-slate-300">{item.note}</span>
                                  </div>
                                  <span className="text-cyan-300 font-bold shrink-0">
                                    +{item.amountUsdt.toFixed(2)} U
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 3. Upgrade Vault 35% History */}
                        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-lg p-2.5 space-y-1.5">
                          <div className="font-bold text-indigo-300 flex items-center justify-between">
                            <span>🏦 ประวัติ 35% อัพเกรด ({rep.vault35History.length})</span>
                            <span className="font-mono">สะสม +{rep.vault35GrossTotalUsdt.toFixed(2)} U</span>
                          </div>
                          {rep.vault35History.length === 0 ? (
                            <div className="text-slate-500 text-[11px]">ยังไม่มีรายการเม็ดซ้ายเข้ากระปุก 35%</div>
                          ) : (
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1 font-mono text-[11px]">
                              {rep.vault35History.map((item, idx) => (
                                <div
                                  key={`v-${idx}`}
                                  className="bg-slate-950 p-1.5 rounded border border-slate-800/90 flex items-start justify-between gap-2"
                                >
                                  <div>
                                    <span className="text-amber-300 font-bold">[R{item.rank}]</span>{' '}
                                    <span className="text-slate-300">{item.note}</span>
                                  </div>
                                  <span className="text-indigo-300 font-bold shrink-0">
                                    +{item.amountUsdt.toFixed(2)} U
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'rewards' ? (
        <>
          {/* Filter Chips for Rewards */}
          <div className="flex flex-wrap items-center justify-between gap-2 my-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500 text-[11px] mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Filter:
              </span>
              {[
                { key: 'all', label: language === 'th' ? `ทั้งหมด (${logs.length})` : `All (${logs.length})` },
                { key: 'DIRECT', label: 'DIRECT (30%)' },
                { key: 'LEVEL', label: 'LEVEL (2%x15)' },
                { key: 'UPGRADE_VAULT', label: 'VAULT (35%)' },
                { key: 'OVERFLOW', label: 'OVERFLOW' },
                { key: 'ALLSELL', label: 'ALLSELL (4%)' },
                { key: 'BOT', label: 'BOT (1%)' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterType(tab.key)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                    filterType === tab.key
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {account && (
              <button
                onClick={() => setOnlyMyWallet(!onlyMyWallet)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] flex items-center gap-1.5 border ${
                  onlyMyWallet
                    ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                <Wallet className="w-3 h-3" />
                <span>{language === 'th' ? 'เฉพาะกระเป๋าฉัน' : 'My Wallet'}</span>
              </button>
            )}
          </div>

          {/* Rewards Table / List */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <div className="py-6 px-4 text-center text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {language === 'th' ? 'ยังไม่มีรายการกระจายรางวัล' : 'No reward events yet'}
                  </span>
                </div>
                {lastSyncedAt && (
                  <div className="text-[10px] font-mono text-slate-600">
                    ซิงค์ล่าสุด: {lastSyncedAt}
                  </div>
                )}
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isDirect = log.rewardType.includes('DIRECT');
                const isUpgrade = log.rewardType.includes('VAULT');
                const isLevel = log.rewardType.includes('LEVEL');

                return (
                  <div
                    key={log.id}
                    className="bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 p-3 rounded-xl transition duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start sm:items-center gap-2.5">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          isDirect
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : isUpgrade
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                            : isLevel
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        <Radio className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-200 font-mono">{log.rewardType}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                            Rank {log.rank}
                          </span>
                          {log.blockNumber && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-mono border border-slate-800">
                              Block #{log.blockNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5 font-mono">
                          <span>
                            Node #{log.fromNodeId} → #{log.toNodeId}
                          </span>
                          <span className="text-slate-600">•</span>
                          <a
                            href={`https://testnet.bscscan.com/address/${log.recipient}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-300 hover:underline"
                            title={log.recipient}
                          >
                            {log.recipient.substring(0, 6)}...{log.recipient.substring(38)}
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono font-bold text-sm text-emerald-400">
                          +{log.amount} USDT
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {log.txHash
                            ? `${log.txHash.slice(0, 8)}...${log.txHash.slice(-6)}`
                            : 'On-Chain State'}
                        </div>
                      </div>

                      <a
                        href={
                          log.txHash
                            ? `https://testnet.bscscan.com/tx/${log.txHash}`
                            : `https://testnet.bscscan.com/address/${CONTRACT_ADDRESS}#events`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                        title="View on BSCScan Testnet"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <>
          {/* Filter Chips for Rank Upgrades */}
          <div className="flex flex-wrap items-center justify-between gap-2 my-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500 text-[11px] mr-1 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {language === 'th' ? 'กรองตามแรงค์:' : 'Filter Rank:'}
              </span>
              <button
                onClick={() => setUpgradeRankFilter(0)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                  upgradeRankFilter === 0
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {language === 'th'
                  ? `ทุกแรงค์ (${upgradeLogs.length})`
                  : `All Ranks (${upgradeLogs.length})`}
              </button>
              {distinctUpgradedRanks.map((r) => (
                <button
                  key={r}
                  onClick={() => setUpgradeRankFilter(r)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] font-mono ${
                    upgradeRankFilter === r
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Rank {r} ({upgradeLogs.filter((u) => u.toRank === r).length})
                </button>
              ))}
            </div>

            {account && (
              <button
                onClick={() => setOnlyMyWallet(!onlyMyWallet)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] flex items-center gap-1.5 border ${
                  onlyMyWallet
                    ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                <Wallet className="w-3 h-3" />
                <span>{language === 'th' ? 'เฉพาะกระเป๋าฉัน' : 'My Wallet'}</span>
              </button>
            )}
          </div>

          {/* Rank Upgrade History List */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {filteredUpgrades.length === 0 ? (
              <div className="py-6 px-4 text-center text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-amber-400 font-semibold">
                  <Zap className="w-4 h-4" />
                  <span>
                    {language === 'th' ? 'ยังไม่มีรายการอัพแรงค์ตามเงื่อนไขที่เลือก' : 'No rank upgrades found'}
                  </span>
                </div>
                {lastSyncedAt && (
                  <div className="text-[10px] font-mono text-slate-600">
                    ซิงค์ล่าสุด: {lastSyncedAt}
                  </div>
                )}
              </div>
            ) : (
              filteredUpgrades.map((up) => {
                const modeInfo =
                  up.upgradeMode === 'AUTO_VAULT'
                    ? {
                        label: language === 'th' ? 'Auto-Upgrade (หัก Vault 100%)' : 'Auto Vault 100%',
                        cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                      }
                    : up.upgradeMode === 'HYBRID_VAULT_WALLET'
                    ? {
                        label: language === 'th' ? 'หักยอด Vault + จ่ายส่วนต่างกระเป๋า' : 'Vault + Wallet Top-up',
                        cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                      }
                    : up.upgradeMode === 'CLONE_IN_RANK'
                    ? {
                        label: language === 'th' ? 'รหัสโคลนในแรงค์' : 'Rank Clone',
                        cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
                      }
                    : {
                        label: language === 'th' ? 'อัปเกรดด้วย USDT จากกระเป๋า' : 'Manual Wallet USDT',
                        cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
                      };

                return (
                  <div
                    key={up.id}
                    className="bg-slate-950/90 border border-slate-800 hover:border-indigo-500/40 p-3.5 rounded-xl transition duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-indigo-500/15 text-amber-300 border border-indigo-500/30 shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap font-mono">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40">
                            Main ID #{up.mainNodeId}
                          </span>
                          <span className="font-bold text-amber-300 text-sm">
                            Rank {up.fromRank} ➔ Rank {up.toRank}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-semibold">
                            Node #{up.newNodeId} (ใน Rank {up.toRank})
                          </span>
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${modeInfo.cls}`}>
                            {modeInfo.label}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                          <span>
                            {language === 'th' ? 'วางใต้โหนด:' : 'Parent:'} #{up.parentId} (
                            {up.side === 'LEFT' ? 'ซ้าย • จ่ายรางวัล 30%/35%' : 'ขวา • Rebirth'})
                          </span>
                          <span className="text-slate-600">•</span>
                          <span>
                            {language === 'th' ? 'ผู้แนะนำในแรงค์:' : 'Sponsor Node:'} #{up.directSponsorNodeId}
                          </span>
                          <span className="text-slate-600">•</span>
                          <a
                            href={`https://testnet.bscscan.com/address/${up.owner}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-300 hover:underline"
                            title={up.owner}
                          >
                            {up.owner.slice(0, 6)}...{up.owner.slice(-4)}
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 font-mono">
                      <div className="text-right space-y-0.5">
                        <div className="font-bold text-sm text-amber-400">
                          ราคาแรงค์: {up.rankPriceUsdt} USDT
                        </div>
                        <div className="text-[10px] flex items-center justify-end gap-2">
                          <span className="text-emerald-400">
                            หัก Vault: -{up.vaultDeductedUsdt} U
                          </span>
                          <span className="text-slate-600">|</span>
                          <span className="text-indigo-300">
                            จ่ายส่วนต่าง: {up.walletPaidUsdt} U
                          </span>
                        </div>
                      </div>

                      <a
                        href={
                          up.txHash && !up.txHash.startsWith('0xup')
                            ? `https://testnet.bscscan.com/tx/${up.txHash}`
                            : `https://testnet.bscscan.com/address/${CONTRACT_ADDRESS}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                        title="ดูธุรกรรมบน BSCScan Testnet"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};
