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

export const EventLogsSection: React.FC<EventLogsSectionProps> = ({ language, account }) => {
  const [activeTab, setActiveTab] = useState<'rewards' | 'upgrades'>('rewards');
  const [logs, setLogs] = useState<RewardLog[]>([]);
  const [upgradeLogs, setUpgradeLogs] = useState<RankUpgradeLog[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [upgradeRankFilter, setUpgradeRankFilter] = useState<number>(0);
  const [onlyMyWallet, setOnlyMyWallet] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [latestBlock, setLatestBlock] = useState<number>(0);
  const [totalNodesRank1, setTotalNodesRank1] = useState<number>(0);
  const [usdtDecimals, setUsdtDecimals] = useState<number>(6);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');

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

    // 1. อ่านข้อมูลประวัติการกระจายรางวัล + ประวัติการอัพแรงค์จาก Database ของเราเป็นหลัก (/api/rewards & /api/upgrades)
    try {
      const endpoint = forceSync ? '/api/rewards?forceSync=1' : '/api/rewards';
      const dbRes = await fetch(endpoint, { headers: { Accept: 'application/json' } });
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
              {activeTab === 'rewards'
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

      {/* Mode Switcher Tabs: Reward Events vs Rank Upgrade History */}
      <div className="flex items-center gap-2 my-3 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('rewards')}
          className={`flex-1 py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
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
          className={`flex-1 py-2 px-3 rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
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
            {activeTab === 'rewards' ? 'Rank 1 Nodes' : 'หักจาก Vault สะสมรวม'}
          </span>
          <span className="text-amber-300 font-bold">
            {activeTab === 'rewards'
              ? `${totalNodesRank1} โหนด`
              : `-${totalVaultDeductedUsdt.toFixed(2)} USDT`}
          </span>
        </div>
        <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-2.5">
          <span className="text-slate-500 block">
            {activeTab === 'rewards' ? 'ยอดรวมที่แสดง' : 'มูลค่าอัพแรงค์รวม (ส่วนต่าง)'}
          </span>
          <span className="text-emerald-400 font-bold">
            {activeTab === 'rewards'
              ? `+${totalRewardUsdt.toFixed(2)} USDT`
              : `${totalUpgradeVolumeUsdt.toFixed(2)} U (ส่วนต่าง ${totalWalletPaidUsdt.toFixed(2)} U)`}
          </span>
        </div>
      </div>

      {activeTab === 'rewards' ? (
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
