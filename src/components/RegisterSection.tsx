import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCheck,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Wallet,
  AlertCircle,
  Layers,
  Sparkles,
  RefreshCw,
  Dna,
  Compass,
  Copy,
  Check,
  Search,
  Hash,
  Lock,
  Server,
  Clock,
} from 'lucide-react';
import {
  ApplicantItem,
  PlacementMode,
  SimulationStepLog,
  WalletNodeDetail,
  previewOffChainSimulation,
} from '../utils/offChainSimulator';
import { CONTRACT_ADDRESS, USDT_ADDRESS, getDynamicContractAddress } from '../contracts/config';
import { QueueStatusData } from '../types';

interface RegisterSectionProps {
  account: string | null;
  isRegistered: boolean;
  mainNodeIdRank1?: string;
  usdtBalance: string;
  allowance: string;
  onConnectWallet?: () => void;
  onApproveUsdt?: (amountUsdt?: number) => Promise<any>;
  onRegister: (
    sponsorNodeId: number,
    autoOptions?: {
      targetParentId?: number | string;
      isLeft?: boolean;
      mode?: PlacementMode;
    }
  ) => Promise<any>;
  onExecuteOffChainBatch?: (
    sponsorNodeId: number,
    applicantsQueue: ApplicantItem[],
    onStatusCallback?: (msg: string) => void,
    mode?: PlacementMode
  ) => Promise<any>;
  onCheckSponsor?: (
    sponsorNodeId: number
  ) => Promise<{ isValid: boolean; reason: string; sponsorAddress: string }>;
  onPreviewPlacement?: (
    rank: number,
    sponsorAddr: string
  ) => Promise<{ targetParentId: string; isLeft: boolean; activeRound: number } | null>;
  isLoading: boolean;
  currentStep: string;
  txError?: string | null;
  txSuccess?: string | null;
  language: 'th' | 'en';
}

export const RegisterSection: React.FC<RegisterSectionProps> = ({
  account,
  isRegistered,
  mainNodeIdRank1,
  usdtBalance,
  allowance,
  onConnectWallet,
  onApproveUsdt,
  onRegister,
  onExecuteOffChainBatch,
  isLoading,
  currentStep,
  txError,
  txSuccess,
  language,
}) => {
  // Text input state so user can freely delete, clear, and type multi-digit numbers like "22" or a wallet "0x..."
  const [sponsorInputText, setSponsorInputText] = useState<string>('1');
  const [sponsorNodeId, setSponsorNodeId] = useState<number>(1);
  const [nodeCount, setNodeCount] = useState<number>(1);
  const [placementMode, setPlacementMode] = useState<PlacementMode>('contract_round');

  // On-chain Rank 1 node directory for fetching wallet IDs
  const [allOnChainNodes, setAllOnChainNodes] = useState<WalletNodeDetail[]>([]);
  const [selectedSponsorDetail, setSelectedSponsorDetail] = useState<WalletNodeDetail | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const [sponsorCheckResult, setSponsorCheckResult] = useState<{
    checked: boolean;
    isValid: boolean;
    reason: string;
    sponsorAddress: string;
  } | null>(null);

  const [placementPreview, setPlacementPreview] = useState<{
    targetParentId: string;
    isLeft: boolean;
    activeRound: number;
    assignedNodeId?: string;
    totalNodesBefore?: number;
    stepLogs?: SimulationStepLog[];
  } | null>(null);

  const [isChecking, setIsChecking] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatusData | null>(null);

  const fetchQueueData = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/status');
      if (res.ok) {
        const data = await res.json();
        setQueueStatus(data);
      }
    } catch {
      // Ignore background network error
    }
  }, []);

  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 8000);
    return () => clearInterval(interval);
  }, [fetchQueueData, txSuccess]);

  const totalCostUsdt = nodeCount * 5;
  const parsedAllowance = parseFloat(allowance || '0');
  const parsedBalance = parseFloat(usdtBalance || '0');
  const isAllowanceSufficient = parsedAllowance >= totalCostUsdt;

  // All Rank 1 Node IDs owned by the connected wallet (`account`)
  const myWalletNodes = useMemo(() => {
    if (!account) return [];
    const lower = account.toLowerCase();
    return allOnChainNodes.filter((n) => n.owner.toLowerCase() === lower);
  }, [account, allOnChainNodes]);

  const myMainNodes = useMemo(
    () => myWalletNodes.filter((n) => !n.isClone),
    [myWalletNodes]
  );

  const myCloneNodes = useMemo(
    () => myWalletNodes.filter((n) => n.isClone),
    [myWalletNodes]
  );

  const selectSponsorId = (id: number | string) => {
    const cleanNum = Number(id);
    if (Number.isFinite(cleanNum) && cleanNum >= 1) {
      setSponsorInputText(String(cleanNum));
      setSponsorNodeId(cleanNum);
    }
  };

  const handleSponsorTextChange = (rawVal: string) => {
    setSponsorInputText(rawVal);
    const trimmed = rawVal.trim();

    // Case 1: User pasted a Wallet Address (0x...) -> find that wallet's Node IDs from on-chain nodes
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      const lowerAddr = trimmed.toLowerCase();
      const matchingNodes = allOnChainNodes.filter(
        (n) => n.owner.toLowerCase() === lowerAddr
      );
      if (matchingNodes.length > 0) {
        const firstMain = matchingNodes.find((n) => !n.isClone) || matchingNodes[0];
        const resolvedId = Number(firstMain.id);
        if (resolvedId >= 1) {
          setSponsorNodeId(resolvedId);
        }
      }
      return;
    }

    // Case 2: User typed a Node ID like "22" or "#22" (allow empty string while typing!)
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      return;
    }
    const parsed = parseInt(digitsOnly, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      setSponsorNodeId(parsed);
    }
  };

  // Auto-Find Placement Position + Fetch Wallet IDs on-chain
  const runAutoFindPlacement = useCallback(
    async (
      targetSponsorId = sponsorNodeId,
      targetCount = nodeCount,
      targetMode: PlacementMode = placementMode,
      walletLookupText?: string
    ) => {
      const effectiveSponsorId = targetSponsorId >= 1 ? targetSponsorId : 1;
      setIsChecking(true);
      try {
        const ownerAddr = account || '0x0000000000000000000000000000000000000001';
        const queue: ApplicantItem[] = Array.from({ length: Math.max(1, targetCount) }, () => ({
          owner: ownerAddr,
        }));

        const sim = await previewOffChainSimulation(
          null,
          getDynamicContractAddress() || CONTRACT_ADDRESS,
          effectiveSponsorId,
          queue,
          undefined,
          targetMode
        );

        if (sim.onChainNodesList) {
          setAllOnChainNodes(sim.onChainNodesList);

          // If the user typed a 0x wallet address in the input, resolve that wallet's Node ID automatically
          const lookupTrimmed = (walletLookupText ?? sponsorInputText).trim();
          if (/^0x[a-fA-F0-9]{40}$/.test(lookupTrimmed)) {
            const lowerWallet = lookupTrimmed.toLowerCase();
            const owned = sim.onChainNodesList.filter(
              (n) => n.owner.toLowerCase() === lowerWallet
            );
            if (owned.length > 0) {
              const primary = owned.find((n) => !n.isClone) || owned[0];
              const resolvedId = Number(primary.id);
              if (resolvedId >= 1 && resolvedId !== effectiveSponsorId) {
                setSponsorNodeId(resolvedId);
                setSponsorInputText(String(resolvedId));
                return;
              }
            }
          }
        }

        setSelectedSponsorDetail(sim.sponsorNodeDetail || null);

        setSponsorCheckResult({
          checked: true,
          isValid: sim.sponsorIsValid,
          reason: sim.sponsorReason || (sim.sponsorIsValid ? 'Valid main sponsor ID' : 'Invalid ID'),
          sponsorAddress: sim.sponsorAddress,
        });

        if (sim.sponsorIsValid && sim.stepLogs.length > 0) {
          const firstStep = sim.stepLogs[0];
          setPlacementPreview({
            targetParentId: firstStep.targetParentId,
            isLeft: firstStep.isLeft,
            activeRound: sim.roundToggle,
            assignedNodeId: firstStep.assignedNodeId,
            totalNodesBefore: sim.totalNodesBefore,
            stepLogs: sim.stepLogs,
          });
        } else {
          setPlacementPreview(null);
        }
      } catch {
        // Ignore transient RPC read error
      } finally {
        setIsChecking(false);
      }
    },
    [account, nodeCount, placementMode, sponsorNodeId, sponsorInputText]
  );

  // Automatically find placement & fetch wallet IDs when Sponsor ID, Node Count, Mode, or Tx Success changes
  useEffect(() => {
    const timer = setTimeout(() => {
      runAutoFindPlacement(sponsorNodeId, nodeCount, placementMode);
    }, 180);
    return () => clearTimeout(timer);
  }, [sponsorNodeId, nodeCount, placementMode, txSuccess, account, runAutoFindPlacement]);

  // Background auto-sync & event listener for tree refresh
  useEffect(() => {
    const handleRefresh = () => {
      runAutoFindPlacement(sponsorNodeId, nodeCount, placementMode);
    };
    window.addEventListener('matrix:tree:refresh', handleRefresh);

    const interval = setInterval(() => {
      if (!isLoading) {
        runAutoFindPlacement(sponsorNodeId, nodeCount, placementMode);
      }
    }, 12000);
    return () => {
      window.removeEventListener('matrix:tree:refresh', handleRefresh);
      clearInterval(interval);
    };
  }, [isLoading, sponsorNodeId, nodeCount, placementMode, runAutoFindPlacement]);

  const handlePullMyWalletIds = async () => {
    await runAutoFindPlacement(sponsorNodeId, nodeCount, placementMode);
    if (myMainNodes.length > 0) {
      selectSponsorId(myMainNodes[myMainNodes.length - 1].id);
    } else if (mainNodeIdRank1 && Number(mainNodeIdRank1) > 0) {
      selectSponsorId(Number(mainNodeIdRank1));
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddr(text);
    setTimeout(() => setCopiedAddr(null), 1800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = sponsorInputText.replace(/[^0-9]/g, '');
    const finalSponsorId = digits ? parseInt(digits, 10) : sponsorNodeId;
    if (!finalSponsorId || finalSponsorId < 1) return;

    setSponsorNodeId(finalSponsorId);
    setSponsorInputText(String(finalSponsorId));

    if (!account && onConnectWallet) {
      onConnectWallet();
      return;
    }

    if (nodeCount > 1 && onExecuteOffChainBatch) {
      const ownerAddr = account || '';
      const queue: ApplicantItem[] = Array.from({ length: nodeCount }, () => ({
        owner: ownerAddr,
      }));
      await onExecuteOffChainBatch(finalSponsorId, queue, undefined, placementMode);
    } else {
      await onRegister(finalSponsorId, {
        targetParentId: placementPreview?.targetParentId,
        isLeft: placementPreview?.isLeft,
        mode: placementMode,
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-sm font-black">
              1
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white">
              {language === 'th'
                ? 'สมัครสมาชิก (Rank 1)'
                : '1. Matrix Registration (Rank 1)'}
            </h3>
          </div>
        </div>

        <div className="text-right shrink-0 bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800">
          <span className="text-[11px] text-slate-400 block">
            {language === 'th' ? 'ค่าสมัคร (Rank 1)' : 'Registration Cost'}
          </span>
          <span className="text-lg font-bold font-mono text-emerald-400">
            {totalCostUsdt} USDT
          </span>
        </div>
      </div>

      {/* Wallet & Balance Status Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4">
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] text-slate-400">
            {language === 'th' ? 'สถานะกระเป๋าที่เชื่อมต่อ' : 'Connected Wallet'}
          </div>
          <div className="text-xs font-mono font-bold text-white mt-0.5 truncate">
            {account ? `${account.slice(0, 8)}...${account.slice(-6)}` : 'ยังไม่ได้เชื่อมต่อกระเป๋า'}
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] text-slate-400">
            {language === 'th' ? 'ยอดคงเหลือ USDT ของคุณ' : 'Your USDT Balance'}
          </div>
          <div
            className={`text-xs font-mono font-bold mt-0.5 ${
              parsedBalance >= totalCostUsdt ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {usdtBalance} USDT
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] text-slate-400">
            {language === 'th' ? 'วงเงินที่อนุมัติแล้ว (Allowance)' : 'Approved Allowance'}
          </div>
          <div
            className={`text-xs font-mono font-bold mt-0.5 ${
              isAllowanceSufficient ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {Number(allowance || 0).toFixed(2)} USDT {isAllowanceSufficient ? '✓' : '(ต้อง Approve)'}
          </div>
        </div>
      </div>

      {/* Connected Wallet Owned Node IDs Panel (ดึงข้อมูล ID ของกระเป๋าที่เชื่อมต่อทั้งหมด) */}
      <div className="mt-4 p-3.5 bg-indigo-950/25 border border-indigo-500/35 rounded-xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Hash className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs font-bold text-indigo-200">
              {language === 'th' ? 'ID ของกระเป๋าคุณ:' : 'Your Wallet IDs:'}
            </span>
            {account && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-700">
                {account.slice(0, 6)}...{account.slice(-4)} ({myWalletNodes.length} รหัส)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handlePullMyWalletIds}
            disabled={isChecking}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-500/40 font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
            <span>
              {language === 'th' ? 'ดึงข้อมูล ID ของกระเป๋า' : 'Fetch Wallet IDs'}
            </span>
          </button>
        </div>

        {account ? (
          myWalletNodes.length > 0 ? (
            <div className="space-y-2">
              {/* Main IDs */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-amber-300 font-semibold mr-1">
                  รหัสหลัก (Main ID: {myMainNodes.length}):
                </span>
                {myMainNodes.map((n) => {
                  const isSelected = Number(n.id) === sponsorNodeId;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => selectSponsorId(n.id)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer flex items-center gap-1 border ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md shadow-amber-950/50'
                          : 'bg-slate-950 hover:bg-slate-800 text-amber-300 border-amber-500/40'
                      }`}
                      title={`คลิกเพื่อใช้รหัสหลัก #${n.id} (Parent #${n.parentId})`}
                    >
                      <span>#{n.id}</span>
                      <span className="text-[10px] opacity-80">(หลัก)</span>
                    </button>
                  );
                })}
              </div>

              {/* Clone IDs (if any) */}
              {myCloneNodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-emerald-300 font-semibold mr-1">
                    รหัสโคลนนิ่ง (Clone ID: {myCloneNodes.length}):
                  </span>
                  {myCloneNodes.map((n) => {
                    const isSelected = Number(n.id) === sponsorNodeId;
                    const belongToSelectedMain =
                      n.originMainId && Number(n.originMainId) === sponsorNodeId;
                    const cloneBadge = n.originMainId
                      ? `#${n.originMainId} #${n.id} #${n.subCloneDepth ?? 0} รอบ ${n.cloneRound || 1}`
                      : `#${n.id} (โคลน)`;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => selectSponsorId(n.originMainId || n.id)}
                        className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer flex items-center gap-1 border ${
                          isSelected || belongToSelectedMain
                            ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                            : 'bg-slate-950 hover:bg-slate-800 text-emerald-300 border-emerald-500/40'
                        }`}
                        title={`โคลน (${cloneBadge}) | รหัสหลัก #${n.originMainId || n.id} | Parent #${n.parentId}`}
                      >
                        <span>({cloneBadge})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 flex items-center justify-between flex-wrap gap-2">
              <span>
                {isRegistered && mainNodeIdRank1 && mainNodeIdRank1 !== '0'
                  ? `พบรหัสโหนดหลักของกระเป๋าคุณ: #${mainNodeIdRank1}`
                  : 'กระเป๋านี้ยังไม่มีรหัสโหนดใน Rank 1 (หรือกดปุ่ม "ดึงข้อมูล ID ของกระเป๋า" เพื่ออัปเดต)'}
              </span>
              {mainNodeIdRank1 && Number(mainNodeIdRank1) > 0 && (
                <button
                  type="button"
                  onClick={() => selectSponsorId(mainNodeIdRank1)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-mono text-xs font-bold cursor-pointer"
                >
                  เลือก #{mainNodeIdRank1}
                </button>
              )}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {allOnChainNodes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-emerald-300 font-semibold mr-1">
                  โหนดบนเชน ({allOnChainNodes.length} รหัส):
                </span>
                {allOnChainNodes.map((n) => {
                  const isSelected = Number(n.id) === sponsorNodeId;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => selectSponsorId(n.id)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                          : n.isClone
                          ? 'bg-slate-950 hover:bg-slate-800 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-950 hover:bg-slate-800 text-amber-300 border-amber-500/40'
                      }`}
                      title={`Owner: ${n.owner} | Parent: #${n.parentId}`}
                    >
                      <span>#{n.id}</span>
                      <span className="text-[10px] opacity-80">
                        ({n.owner.slice(0, 6)}...{n.owner.slice(-4)})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Sponsor Node ID Input (type="text" so user can easily type 22 or paste 0x wallet address) */}
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between gap-2 flex-wrap">
              <span>
                {language === 'th' ? 'รหัสผู้แนะนำ (Sponsor ID):' : 'Sponsor Node ID:'}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {myMainNodes.length > 0 ? (
                  myMainNodes.slice(0, 4).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => selectSponsorId(n.id)}
                      className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 font-mono transition cursor-pointer"
                    >
                      ID ของฉัน #{n.id}
                    </button>
                  ))
                ) : (
                  mainNodeIdRank1 &&
                  Number(mainNodeIdRank1) > 0 && (
                    <button
                      type="button"
                      onClick={() => selectSponsorId(Number(mainNodeIdRank1))}
                      className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 font-mono transition cursor-pointer"
                    >
                      ใช้รหัสตัวเอง #{mainNodeIdRank1}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => selectSponsorId(1)}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition cursor-pointer"
                >
                  Root = #1
                </button>
              </div>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  inputMode="text"
                  value={sponsorInputText}
                  onChange={(e) => handleSponsorTextChange(e.target.value)}
                  onBlur={() => {
                    // If left completely blank on blur, restore current valid sponsorNodeId
                    const clean = sponsorInputText.replace(/[^0-9]/g, '');
                    if (!clean && !sponsorInputText.trim().startsWith('0x')) {
                      setSponsorInputText(String(sponsorNodeId || 1));
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-24 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition"
                  placeholder="พิมพ์เลข ID เช่น 22 หรือวางกระเป๋า 0x..."
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs font-mono font-bold text-emerald-400 pointer-events-none">
                  Node #{sponsorNodeId}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  runAutoFindPlacement(
                    sponsorNodeId,
                    nodeCount,
                    placementMode,
                    sponsorInputText
                  )
                }
                disabled={isChecking}
                className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold px-3 py-2.5 rounded-xl border border-emerald-500/40 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="ดึงข้อมูล ID ของกระเป๋าและค้นหาตำแหน่งว่างออโต้"
              >
                <Search
                  className={`w-3.5 h-3.5 text-emerald-400 ${isChecking ? 'animate-spin' : ''}`}
                />
                <span>
                  {isChecking
                    ? language === 'th'
                      ? 'กำลังดึงข้อมูล...'
                      : 'Fetching...'
                    : language === 'th'
                    ? 'ดึงข้อมูล ID & ตำแหน่ง'
                    : 'Fetch ID & Slot'}
                </span>
              </button>
            </div>
          </div>

          {/* Number of Nodes (1 = register, >1 = registerBatch) */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>{language === 'th' ? 'จำนวนโหนดที่สมัคร:' : 'Node Count:'}</span>
            </label>
            <select
              value={nodeCount}
              onChange={(e) => setNodeCount(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-amber-400 font-mono focus:outline-none focus:border-emerald-500"
            >
              <option value={1}>1 โหนด (5 USDT - Auto)</option>
              <option value={2}>2 โหนด (10 USDT - Auto Batch)</option>
              <option value={3}>3 โหนด (15 USDT - Auto Batch)</option>
              <option value={5}>5 โหนด (25 USDT - Auto Batch)</option>
              <option value={10}>10 โหนด (50 USDT - Auto Batch)</option>
            </select>
          </div>
        </div>

        {/* Auto-Placement Strategy Selector & Live Auto-Resolved Position + Sponsor Wallet IDs Box */}
        <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Compass className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {language === 'th' ? 'โหมดวางตำแหน่ง:' : 'Placement Mode:'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPlacementMode('contract_round')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                  placementMode === 'contract_round'
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                🎯 ติดตัว / โคลนผู้แนะนำ
              </button>
              <button
                type="button"
                onClick={() => setPlacementMode('auto_under_sponsor')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                  placementMode === 'auto_under_sponsor'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                🤖 ออโต้ใต้ #{sponsorNodeId}
              </button>
              <button
                type="button"
                onClick={() => setPlacementMode('global_bfs')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                  placementMode === 'global_bfs'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                🌐 ออโต้ผังใหญ่ (#1)
              </button>
            </div>
          </div>

          {/* Live Sponsor Verification, Fetched Node Info, Sponsor Wallet's All IDs & Auto-Found Placement Result */}
          {sponsorCheckResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono flex flex-col gap-2.5 ${
                sponsorCheckResult.isValid
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5 flex-wrap">
                  <span>
                    {sponsorCheckResult.isValid
                      ? `✓ Sponsor #${sponsorNodeId} ถูกต้องพร้อมใช้งาน`
                      : `✕ Sponsor #${sponsorNodeId} ไม่ถูกต้อง`}
                    : {sponsorCheckResult.reason}
                  </span>
                  {selectedSponsorDetail && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        selectedSponsorDetail.isClone
                          ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                          : 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                      }`}
                    >
                      {selectedSponsorDetail.isClone ? 'CLONE ID (รหัสโคลน)' : 'MAIN ID (รหัสหลัก)'}
                    </span>
                  )}
                </span>

                {placementPreview &&
                  (() => {
                    const targetParentNode = allOnChainNodes.find(
                      (n) => n.id === String(placementPreview.targetParentId)
                    );
                    const cloneLabel =
                      targetParentNode && targetParentNode.isClone
                        ? ` [โคลนนิ่ง (#${targetParentNode.originMainId || sponsorNodeId} #${
                            targetParentNode.id
                          } #${targetParentNode.subCloneDepth ?? 0} รอบ ${
                            targetParentNode.cloneRound || 1
                          })]`
                        : '';
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/40 font-bold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            ตำแหน่งที่จะลง (ออโต้): Parent #{placementPreview.targetParentId}
                            {cloneLabel} ({placementPreview.isLeft ? 'LEFT ลูกซ้าย' : 'RIGHT ลูกขวา'}
                            )
                          </span>
                        </span>
                        {placementPreview.assignedNodeId && (
                          <span className="text-emerald-200 bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/40 font-bold">
                            ได้รหัสใหม่ #{placementPreview.assignedNodeId}
                          </span>
                        )}
                      </div>
                    );
                  })()}
              </div>

              {/* Fetched Sponsor Node & Wallet Information Box */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-slate-400">กระเป๋าของโหนด #{sponsorNodeId}:</span>
                    <span className="text-white font-bold truncate">
                      {sponsorCheckResult.sponsorAddress}
                    </span>
                    {sponsorCheckResult.sponsorAddress && (
                      <button
                        type="button"
                        onClick={() => copyText(sponsorCheckResult.sponsorAddress)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
                        title="คัดลอกที่อยู่กระเป๋า"
                      >
                        {copiedAddr === sponsorCheckResult.sponsorAddress ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {selectedSponsorDetail && (
                    <div className="flex flex-wrap items-center gap-2 text-slate-300">
                      <span>
                        อัพไลน์:{' '}
                        <strong className="text-indigo-300">
                          #{selectedSponsorDetail.parentId}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        ซ้าย:{' '}
                        <strong className="text-emerald-300">
                          {selectedSponsorDetail.leftChild !== '0'
                            ? `#${selectedSponsorDetail.leftChild}`
                            : 'ว่าง'}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        ขวา:{' '}
                        <strong className="text-purple-300">
                          {selectedSponsorDetail.rightChild !== '0'
                            ? `#${selectedSponsorDetail.rightChild}`
                            : 'ว่าง'}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>


              </div>

              {/* Show Multi-Node or Clone Cascade Preview Details */}
              {placementPreview?.stepLogs && placementPreview.stepLogs.length > 0 && (
                <div className="pt-1 border-t border-emerald-500/20 space-y-1">
                  {placementPreview.stepLogs.map((step) => (
                    <div
                      key={step.applicantIndex}
                      className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-200 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-emerald-400 font-bold">
                          โหนดที่ {step.applicantIndex} (รหัสใหม่ #{step.assignedNodeId}):
                        </span>
                        <span>
                          ลงใต้ <strong className="text-amber-300">Parent #{step.targetParentId}</strong>{' '}
                          ฝั่ง{' '}
                          <strong
                            className={step.isLeft ? 'text-emerald-300' : 'text-purple-300'}
                          >
                            {step.isLeft ? 'ซ้าย (LEFT 1)' : 'ขวา (RIGHT 2)'}
                          </strong>
                        </span>
                      </div>

                      {step.spawnedClones && step.spawnedClones.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 font-semibold">
                          <Dna className="w-3 h-3 text-purple-300 shrink-0" />
                          <span>
                            เกิดรหัสโคลนนิ่งออโต้:{' '}
                            {step.spawnedClones
                              .map(
                                (c) =>
                                  `#${c.cloneNodeId} (ใต้ #${c.cloneParentId} ${
                                    c.cloneIsLeft ? 'ซ้าย' : 'ขวา'
                                  })`
                              )
                              .join(', ')}
                          </span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Compact Queue Counter Strip */}
        {queueStatus && (queueStatus.waitingJobsCount > 0 || queueStatus.activeReservationsCount > 0) && (
          <div className="rounded-xl bg-slate-950/90 border border-indigo-500/30 px-3.5 py-2 flex items-center justify-between text-xs font-mono">
            <span className="text-indigo-300 font-bold flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>คิวประมวลผล (FIFO Queue)</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="text-amber-400">รอคิว: {queueStatus.waitingJobsCount}</span>
              <span className="text-emerald-400">ล็อคจอง: {queueStatus.activeReservationsCount}</span>
            </div>
          </div>
        )}

        {/* Inline Transaction Error / Success Feedback */}
        {txError && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{txError}</span>
          </div>
        )}
        {txSuccess && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{txSuccess}</span>
          </div>
        )}

        {/* Action Buttons: Step 1 Approve USDT + Step 2 Confirm Register */}
        {!account ? (
          <button
            type="button"
            onClick={onConnectWallet}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl transition duration-200 text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Wallet className="w-4 h-4" />
            <span>
              {language === 'th'
                ? 'เชื่อมต่อกระเป๋า MetaMask เพื่อสมัครสมาชิก (Connect Wallet)'
                : 'Connect MetaMask Wallet to Register'}
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onApproveUsdt && (
              <button
                type="button"
                onClick={() => onApproveUsdt()}
                disabled={isLoading}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold py-3.5 px-4 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>
                  {language === 'th'
                    ? `1. อนุมัติวงเงิน USDT แบบไม่จำกัด (Approve Max)`
                    : `1. Approve Unlimited USDT`}
                </span>
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl transition duration-200 text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  <span className="truncate">
                    {currentStep || (language === 'th' ? 'กำลังทำรายการ...' : 'Processing...')}
                  </span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {nodeCount === 1
                      ? language === 'th'
                        ? `2. ยืนยันสมัครลงตำแหน่งออโต้ (${totalCostUsdt} USDT)`
                        : `2. Confirm Auto-Register (${totalCostUsdt} USDT)`
                      : language === 'th'
                      ? `2. ยืนยันสมัคร ${nodeCount} โหนดออโต้ (${totalCostUsdt} USDT)`
                      : `2. Auto-Register ${nodeCount} Nodes (${totalCostUsdt} USDT)`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
