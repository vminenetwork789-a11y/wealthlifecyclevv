import React, { useState, useEffect } from 'react';
import { RANK_PRICES_USDT } from '../contracts/config';
import { RefreshCw, ShieldAlert, Search, Database, Save, RotateCcw, ExternalLink, Check, Copy, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

interface RankInspectorAndAdminPanelProps {
  account: string | null;
  language: 'th' | 'en';
  selectedInspectRank: number;
  onSelectInspectRank: (rank: number) => void;
  onInspectRank: (rank: number) => Promise<{
    firstNodeId: string;
    latestNodeId: string;
    upgradeVaultBalance: string;
    nextRankPrice: string;
  }>;
  onRefreshOnChainData: () => void;
  onAdminUpgrade: (targetUser: string, targetRank: number) => Promise<any>;
  onVaultBalanceChange?: (vaultStr: string) => void;
  isLoading: boolean;
  contractAddress?: string;
  usdtAddress?: string;
  onUpdateContractAddress?: (newContract: string, newUsdt?: string) => Promise<boolean>;
  onResetContractAddress?: () => Promise<boolean>;
}

export const RankInspectorAndAdminPanel: React.FC<RankInspectorAndAdminPanelProps> = ({
  account,
  language,
  selectedInspectRank,
  onSelectInspectRank,
  onInspectRank,
  onRefreshOnChainData,
  onAdminUpgrade,
  onVaultBalanceChange,
  isLoading,
  contractAddress,
  usdtAddress,
  onUpdateContractAddress,
  onResetContractAddress,
}) => {
  const [rankStats, setRankStats] = useState<{
    firstNodeId: string;
    latestNodeId: string;
    upgradeVaultBalance: string;
    nextRankPrice: string;
  }>({
    firstNodeId: '-',
    latestNodeId: '-',
    upgradeVaultBalance: '0.00',
    nextRankPrice: '10.00 USDT',
  });

  const [adminUserAddr, setAdminUserAddr] = useState<string>('');
  const [adminTargetRankText, setAdminTargetRankText] = useState<string>('2');
  const [isRefreshingRank, setIsRefreshingRank] = useState<boolean>(false);

  // Smart Contract Database Management State
  const [editingContract, setEditingContract] = useState<string>(contractAddress || '');
  const [editingUsdt, setEditingUsdt] = useState<string>(usdtAddress || '');
  const [isSavingContract, setIsSavingContract] = useState<boolean>(false);
  const [contractSaveMsg, setContractSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<boolean>(false);

  // Target User/Main ID Live Lookup
  const [targetLookupInfo, setTargetLookupInfo] = useState<{
    loading: boolean;
    found: boolean;
    mainId?: number;
    owner?: string;
    currentRank?: number;
    directSponsorNodeId?: number;
    directSponsor?: string;
  } | null>(null);

  useEffect(() => {
    const query = adminUserAddr.trim().replace(/^#/, '');
    if (!query) {
      setTargetLookupInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setTargetLookupInfo((prev) => (prev ? { ...prev, loading: true } : { loading: true, found: false }));
        const res = await fetch(`/api/admin/lookup-target?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && data.found) {
          setTargetLookupInfo({
            loading: false,
            found: true,
            mainId: data.mainId,
            owner: data.owner,
            currentRank: data.currentRank,
            directSponsorNodeId: data.directSponsorNodeId,
            directSponsor: data.directSponsor,
          });
        } else {
          setTargetLookupInfo({ loading: false, found: false });
        }
      } catch {
        setTargetLookupInfo(null);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [adminUserAddr]);

  useEffect(() => {
    if (contractAddress) setEditingContract(contractAddress);
  }, [contractAddress]);

  useEffect(() => {
    if (usdtAddress) setEditingUsdt(usdtAddress);
  }, [usdtAddress]);

  const loadRankInfo = async (rank: number) => {
    setIsRefreshingRank(true);
    try {
      const info = await onInspectRank(rank);
      setRankStats(info);
      if (onVaultBalanceChange) {
        onVaultBalanceChange(`${info.upgradeVaultBalance} USDT`);
      }
    } finally {
      setIsRefreshingRank(false);
    }
  };

  useEffect(() => {
    loadRankInfo(selectedInspectRank);
  }, [selectedInspectRank, account]);

  const handleRankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRank = Number(e.target.value);
    onSelectInspectRank(newRank);
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUserAddr) return;
    const parsedRank = Math.min(27, Math.max(2, parseInt(adminTargetRankText.replace(/[^0-9]/g, ''), 10) || 2));
    setAdminTargetRankText(String(parsedRank));
    onAdminUpgrade(adminUserAddr.trim(), parsedRank);
  };

  return (
    <div className="space-y-8">
      {/* 4. Rank Inspector */}
      <div className="bg-slate-900/90 border border-emerald-500/20 p-6 rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.12)] space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-400" />
            <span>{language === 'th' ? '4. ตรวจสอบแรงค์ (Rank Inspector)' : '4. Rank Inspector'}</span>
          </h2>
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2.5 py-1 rounded-full font-mono">
            Rank {selectedInspectRank}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
              {language === 'th' ? 'เลือกแรงค์ที่ต้องการตรวจสอบ (Choose Rank to Inspect)' : 'Choose Rank to Inspect'}
            </label>
            {/* Horizontal Scrollable Rank Buttons Bar (Matching User's Screenshot Design) */}
            <div className="w-full overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-indigo-500/40 scrollbar-track-slate-950 flex items-center gap-2 select-none mb-2.5">
              {RANK_PRICES_USDT.map((price, idx) => {
                const r = idx + 1;
                const isSelected = selectedInspectRank === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onSelectInspectRank(r)}
                    className={`px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer shrink-0 flex items-center gap-1.5 text-xs ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 border-2 border-indigo-300 shadow-[0_0_16px_rgba(139,92,246,0.5)] ring-2 ring-indigo-400/30 text-white font-extrabold'
                        : 'bg-[#181a38] hover:bg-[#21244c] border border-[#3b3e6e] text-slate-300 font-bold'
                    }`}
                  >
                    {isSelected && (
                      <span className="text-emerald-400 font-black text-xs leading-none drop-shadow">
                        ✓
                      </span>
                    )}
                    {isSelected && <span className="text-xs leading-none">👑</span>}
                    <span className="text-xs tracking-tight whitespace-nowrap">
                      {language === 'th' ? `ผัง ${r}` : `Rank ${r}`}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono text-[10.5px] leading-tight ${
                        isSelected
                          ? 'bg-black/40 text-cyan-300 border border-cyan-400/30 font-bold'
                          : 'bg-black/50 text-slate-300 border border-slate-700/60'
                      }`}
                    >
                      {price}U
                    </span>
                  </button>
                );
              })}
            </div>

            <select
              id="inspectRankSelect"
              value={selectedInspectRank}
              onChange={handleRankChange}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            >
              {RANK_PRICES_USDT.map((price, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  Rank {idx + 1} ({price.toLocaleString()} USDT)
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">First Node ID:</span>
              <span id="inspectFirstId" className="font-mono font-bold text-emerald-400">
                {rankStats.firstNodeId}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Latest Node ID:</span>
              <span id="inspectLatestId" className="font-mono font-bold text-teal-400">
                {rankStats.latestNodeId}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Upgrade Vault Balance:</span>
              <span id="inspectVault" className="font-mono font-bold text-amber-400">
                {rankStats.upgradeVaultBalance} USDT
              </span>
            </div>
            <div className="flex justify-between text-xs border-t border-slate-800 pt-2">
              <span className="text-slate-400">Next Rank Price:</span>
              <span id="inspectNextPrice" className="font-mono font-bold text-slate-200">
                {rankStats.nextRankPrice}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onRefreshOnChainData();
              loadRankInfo(selectedInspectRank);
            }}
            disabled={isRefreshingRank}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl transition duration-200 text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingRank ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{language === 'th' ? '🔄 รีเฟรชข้อมูลบนเชน (Refresh On-Chain Data)' : '🔄 Refresh On-Chain Data'}</span>
          </button>
        </div>
      </div>

      {/* 5. Admin Controls */}
      <div className="bg-slate-900/90 border border-emerald-500/20 p-6 rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.12)] space-y-5">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>{language === 'th' ? '5. Admin Controls' : '5. Admin Controls'}</span>
          </h2>
        </div>

        <form onSubmit={handleAdminSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1 flex items-center justify-between">
              <span>{language === 'th' ? 'เลข ID หลัก (เช่น 5 หรือ #5) หรือ Wallet Address' : 'Target Main ID (#) or Wallet Address'}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdminUserAddr('5')}
                  className="text-[10px] text-cyan-400 hover:underline normal-case"
                >
                  #5
                </button>
                <button
                  type="button"
                  onClick={() => setAdminUserAddr('2')}
                  className="text-[10px] text-cyan-400 hover:underline normal-case"
                >
                  #2
                </button>
                {account && (
                  <button
                    type="button"
                    onClick={() => setAdminUserAddr(account)}
                    className="text-[10px] text-emerald-400 hover:underline normal-case"
                  >
                    {language === 'th' ? 'ใส่กระเป๋าของฉัน' : 'Use My Address'}
                  </button>
                )}
              </div>
            </label>
            <input
              type="text"
              id="adminUserAddr"
              value={adminUserAddr}
              onChange={(e) => setAdminUserAddr(e.target.value)}
              placeholder={language === 'th' ? 'ระบุเลขรหัสหลัก เช่น 5, #5 หรือ Wallet 0x...' : 'e.g. 5, #5 or 0x...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />

            {/* Target Live Lookup Status */}
            {targetLookupInfo && !targetLookupInfo.loading && targetLookupInfo.found && (
              <div className="mt-1.5 p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-[10.5px] text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white">
                    รหัสหลัก #{targetLookupInfo.mainId}
                  </span>
                  <span className="text-slate-400 font-mono text-[9.5px]">
                    ({targetLookupInfo.owner?.substring(0, 8)}...)
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 text-[9.5px]">
                    ปัจจุบัน Rank {targetLookupInfo.currentRank}
                  </span>
                  <span className="text-indigo-300 text-[9.5px]">
                    ผู้แนะนำ #{targetLookupInfo.directSponsorNodeId}
                  </span>
                </div>
              </div>
            )}
            {targetLookupInfo && !targetLookupInfo.loading && !targetLookupInfo.found && adminUserAddr.trim() && (
              <div className="mt-1.5 p-1.5 px-2 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[10px] text-rose-300 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                <span>ยังไม่พบรหัสหลักหรือกระเป๋านี้ในผัง Rank 1</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                Target Rank (2-27)
              </label>
              <input
                type="text"
                inputMode="numeric"
                id="adminTargetRank"
                value={adminTargetRankText}
                onChange={(e) => setAdminTargetRankText(e.target.value)}
                placeholder="เช่น 2 - 27"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isLoading || !adminUserAddr}
                className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold py-2 rounded-lg transition duration-200 text-xs cursor-pointer disabled:opacity-50 shadow-md shadow-red-950/40"
              >
                {isLoading ? (language === 'th' ? 'กำลังอัปเกรด...' : 'Upgrading...') : 'Admin Upgrade (ฟรี)'}
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{language === 'th' ? 'เงื่อนไข Admin Free Upgrade:' : 'Admin Free Upgrade Rules:'}</span>
            </div>
            <ul className="list-disc list-inside text-[10px] text-slate-400 space-y-0.5">
              <li>{language === 'th' ? 'สามารถใส่เป็น "เลขรหัสหลัก" (เช่น 5, #5) หรือ "Wallet Address" ได้โดยตรง' : 'Accepts Main ID number (e.g. 5, #5) or Wallet Address'}</li>
              <li>{language === 'th' ? 'อัปแรงค์ให้ฟรี ไม่มีค่าใช้จ่าย USDT' : 'Free rank upgrade (No USDT required)'}</li>
              <li>{language === 'th' ? 'ระบบโคลนนิ่ง (Rebirth Clone) ทำงานปกติเมื่อลงฝั่งขวา' : 'Rebirth cloning triggers normally when placed on the right slot'}</li>
              <li>{language === 'th' ? 'ไม่จ่ายค่าคอมมิชชั่น (ไม่มีการหักหรือโอนเงินรางวัล)' : 'No commission payout (direct, unilevel, allsell, and bot are bypassed)'}</li>
            </ul>
          </div>
        </form>
      </div>

      {/* 6. Smart Contract Address & Database Manager */}
      <div className="bg-slate-900/90 border border-indigo-500/30 p-6 rounded-2xl shadow-[0_0_25px_rgba(99,102,241,0.12)] space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>{language === 'th' ? '6. จัดการที่อยู่ Smart Contract' : '6. Smart Contract Manager'}</span>
          </h2>
          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] px-2.5 py-1 rounded-full font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Database Active</span>
          </span>
        </div>

        {/* Current Active Contract Display */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-semibold uppercase">
              {language === 'th' ? 'สัญญาปัจจุบันใน Database:' : 'Current Contract in DB:'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (contractAddress) {
                    navigator.clipboard.writeText(contractAddress);
                    setCopiedAddr(true);
                    setTimeout(() => setCopiedAddr(false), 2000);
                  }
                }}
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 p-1 bg-slate-800 rounded transition cursor-pointer"
              >
                {copiedAddr ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedAddr ? (language === 'th' ? 'คัดลอกแล้ว' : 'Copied') : (language === 'th' ? 'คัดลอก' : 'Copy')}</span>
              </button>
              {contractAddress && (
                <a
                  href={`https://testnet.bscscan.com/address/${contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-indigo-400 hover:underline flex items-center gap-0.5"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
          <div className="font-mono text-xs text-amber-300 break-all select-all">
            {contractAddress || '-'}
          </div>
          {usdtAddress && (
            <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-900 font-mono">
              USDT Token: <span className="text-slate-300 select-all">{usdtAddress}</span>
            </div>
          )}
        </div>

        {/* Edit Form */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editingContract.trim()) return;
            setIsSavingContract(true);
            setContractSaveMsg(null);
            try {
              if (onUpdateContractAddress) {
                const ok = await onUpdateContractAddress(editingContract.trim(), editingUsdt.trim() || undefined);
                if (ok) {
                  setContractSaveMsg({
                    type: 'success',
                    text: language === 'th' ? 'บันทึกลง Database เรียบร้อยแล้ว' : 'Saved to database successfully',
                  });
                  setTimeout(() => setContractSaveMsg(null), 4000);
                } else {
                  setContractSaveMsg({
                    type: 'error',
                    text: language === 'th' ? 'บันทึกไม่สำเร็จ ตรวจสอบรูปแบบ Address' : 'Failed to save, check address format',
                  });
                }
              }
            } finally {
              setIsSavingContract(false);
            }
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
              {language === 'th' ? 'เลขที่อยู่ Smart Contract ใหม่ (EVM Address)' : 'New Smart Contract Address'}
            </label>
            <input
              type="text"
              value={editingContract}
              onChange={(e) => setEditingContract(e.target.value)}
              placeholder="0x..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
              {language === 'th' ? 'เลขที่อยู่ USDT Token (เว้นว่างไว้หากใช้ค่าเดิม)' : 'USDT Token Address (Optional)'}
            </label>
            <input
              type="text"
              value={editingUsdt}
              onChange={(e) => setEditingUsdt(e.target.value)}
              placeholder="0x..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {contractSaveMsg && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                contractSaveMsg.type === 'success'
                  ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/50 border border-rose-500/40 text-rose-300'
              }`}
            >
              {contractSaveMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{contractSaveMsg.text}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isSavingContract || !editingContract.trim()}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-semibold py-2.5 rounded-xl transition duration-200 text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingContract ? (language === 'th' ? 'กำลังบันทึกลง Database...' : 'Saving to Database...') : (language === 'th' ? '💾 บันทึกที่อยู่สัญญาลง Database' : '💾 Save to Database')}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (onResetContractAddress) {
                  setIsSavingContract(true);
                  setContractSaveMsg(null);
                  try {
                    const ok = await onResetContractAddress();
                    if (ok) {
                      setContractSaveMsg({
                        type: 'success',
                        text: language === 'th' ? 'คืนค่าเริ่มต้นสำเร็จ' : 'Reset to default successfully',
                      });
                      setTimeout(() => setContractSaveMsg(null), 4000);
                    }
                  } finally {
                    setIsSavingContract(false);
                  }
                }
              }}
              disabled={isSavingContract}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title={language === 'th' ? 'คืนค่าสัญญาเป็นค่าเริ่มต้น' : 'Reset to default contract'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{language === 'th' ? 'คืนค่า' : 'Reset'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
