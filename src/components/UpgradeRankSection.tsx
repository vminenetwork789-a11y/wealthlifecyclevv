import React, { useState, useEffect, useCallback } from 'react';
import { RANK_DEFINITIONS, CONTRACT_ADDRESS } from '../contracts/config';
import { RankUpgradeLog } from '../types';
import { Zap, Check, ArrowUpRight, Sparkles, Wallet, History, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';

interface UpgradeRankSectionProps {
  account: string | null;
  currentRank: number;
  allowance: string;
  onUpgrade: (targetRank: number, mainId?: number | string) => Promise<any>;
  onProcessAutoNewMainId?: (mainId?: number | string) => Promise<any>;
  onProcessAutoExtraId?: (currentRank: number, mainId?: number | string) => Promise<any>;
  isLoading: boolean;
  currentStep: string;
  language: 'th' | 'en';
  // Scoped to specific Main ID (Idหลักนั้นๆ ไม่ใช่ไอดีหลักของกระเป๋า)
  selectedMainId?: string | number;
  ownedMainIds?: string[];
  onSelectMainId?: (mainId: string) => void;
  upgradeRankPool?: number;
  newAutoIdPool?: number;
  newExtraIdPool?: number;
  window5Start?: number;
  window5End?: number;
}

export const UpgradeRankSection: React.FC<UpgradeRankSectionProps> = ({
  account,
  currentRank,
  onUpgrade,
  onProcessAutoNewMainId,
  onProcessAutoExtraId,
  isLoading,
  currentStep,
  language,
  selectedMainId = '1',
  ownedMainIds = [],
  onSelectMainId,
  upgradeRankPool = 0,
  newAutoIdPool = 0,
  newExtraIdPool = 0,
  window5Start = Math.max(1, (currentRank || 1) - 4),
  window5End = currentRank || 1,
}) => {
  const nextStepRank = Math.min(Math.max(2, (currentRank || 1) + 1), 27);
  const [selectedRank, setSelectedRank] = useState<number>(nextStepRank);
  const [tierGroupTab, setTierGroupTab] = useState<'Starter (1-10)' | 'Growth (11-20)' | 'Whale (21-27)'>('Starter (1-10)');
  const [showAutoIdInfo, setShowAutoIdInfo] = useState<boolean>(false);
  const [upgradeLogs, setUpgradeLogs] = useState<RankUpgradeLog[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'mainId'>('all');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [customMainIdInput, setCustomMainIdInput] = useState<string>(String(selectedMainId || '1'));

  useEffect(() => {
    setCustomMainIdInput(String(selectedMainId || '1'));
  }, [selectedMainId]);

  const fetchUpgradeHistory = useCallback(async (forceSync = false) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(forceSync ? '/api/upgrades?forceSync=1' : '/api/upgrades', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Array.isArray(json.data)) {
          setUpgradeLogs(json.data);
        }
      }
    } catch {
      // Ignore network error
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchUpgradeHistory(false);
    const handleRefresh = () => fetchUpgradeHistory(false);
    if (typeof window !== 'undefined') {
      window.addEventListener('matrix:tree:refresh', handleRefresh);
    }
    const timer = setInterval(() => fetchUpgradeHistory(false), 8000);
    return () => {
      clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('matrix:tree:refresh', handleRefresh);
      }
    };
  }, [fetchUpgradeHistory, currentRank, selectedMainId]);

  useEffect(() => {
    const nextR = Math.min(Math.max(2, (currentRank || 1) + 1), 27);
    setSelectedRank(nextR);
    if (nextR <= 10) setTierGroupTab('Starter (1-10)');
    else if (nextR <= 20) setTierGroupTab('Growth (11-20)');
    else setTierGroupTab('Whale (21-27)');
  }, [currentRank, selectedMainId]);

  const targetRankDef = RANK_DEFINITIONS.find((r) => r.rank === selectedRank);

  const handleUpgradeClick = () => {
    onUpgrade(selectedRank, selectedMainId);
  };

  const visibleRanks = RANK_DEFINITIONS.filter((r) => r.rank >= 2 && r.tierGroup === tierGroupTab);

  // เงื่อนไข Auto Extra ID: นำยอด New Extra ID Pool มาลูปหาราคาแต่ละ Rank จาก Rank 27 ลงมาถึง Rank 2
  const { targetExtraRank, targetExtraPrice, isExtraReady } = React.useMemo(() => {
    const poolBal = Number(newExtraIdPool || 0);
    for (let r = 27; r >= 2; r--) {
      const def = RANK_DEFINITIONS.find((d) => d.rank === r);
      const price = def?.priceUSDT || 10;
      if (poolBal + 1e-6 >= price) {
        return { targetExtraRank: r, targetExtraPrice: price, isExtraReady: true };
      }
    }
    const minRank2Def = RANK_DEFINITIONS.find((d) => d.rank === 2);
    const minPrice = minRank2Def?.priceUSDT || 10;
    return { targetExtraRank: 2, targetExtraPrice: minPrice, isExtraReady: false };
  }, [newExtraIdPool]);

  const isMainReady = (newAutoIdPool || 0) >= 5.0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden space-y-4">
      <div className="absolute top-0 right-0 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-bold text-indigo-400">
              {language === 'th' ? '🚀 อัปเกรดแรงค์ 2 - 27' : '🚀 Rank Progression (Rank 2 - 27)'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {language === 'th'
              ? 'คำนวณแยกตาม "Idหลักนั้นๆ" โดยเฉพาะ ไม่ใช่ยอดรวมทั้งกระเป๋า (1 กระเป๋าถือครองได้หลายรหัสหลัก)'
              : 'Calculated strictly per individual Main ID (not combined across wallet)'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {language === 'th' ? `สถานะ ID #${selectedMainId}:` : `ID #${selectedMainId} Rank:`}
          </span>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-emerald-400 border border-slate-700">
            Rank {currentRank || 1} / 27
          </span>
        </div>
      </div>

      {/* Wallet Main IDs Bar & Selector */}
      <div className="bg-slate-950/90 border border-indigo-500/40 rounded-xl p-3.5 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Wallet className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs font-bold text-slate-200">
              {language === 'th' ? '👛 ID หลักของกระเป๋านี้:' : '👛 Wallet Main IDs:'}
            </span>
            {account ? (
              <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/60 border border-indigo-800/80 px-2 py-0.5 rounded">
                {account.slice(0, 6)}...{account.slice(-4)}
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 font-semibold">
                {language === 'th' ? '(ยังไม่ได้เชื่อมกระเป๋า)' : '(Wallet Not Connected)'}
              </span>
            )}
          </div>

          <div className="text-[11px] text-indigo-300/90 font-mono">
            {language === 'th'
              ? `ถือครองทั้งหมด ${ownedMainIds.length > 0 ? ownedMainIds.length : (selectedMainId ? 1 : 0)} ID หลัก (แยกกระเป๋า Vault ตาม ID)`
              : `Total ${ownedMainIds.length > 0 ? ownedMainIds.length : (selectedMainId ? 1 : 0)} Main IDs`}
          </div>
        </div>

        {/* Owned Main IDs List Badges & Manual Input Selector */}
        <div className="flex flex-col gap-2.5 pt-2.5 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 shrink-0 font-semibold">
                {language === 'th' ? 'เลือก ID หลักดำเนินการ:' : 'Select Main ID:'}
              </span>
              {ownedMainIds && ownedMainIds.length > 0 ? (
                ownedMainIds.map((mId) => {
                  const isSelected = String(selectedMainId) === String(mId);
                  return (
                    <button
                      key={mId}
                      type="button"
                      onClick={() => {
                        onSelectMainId?.(mId);
                        setCustomMainIdInput(String(mId));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-950/50'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                      <span>Main ID #{mId}</span>
                      {isSelected && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-semibold">
                          {language === 'th' ? 'เลือกอยู่' : 'Active'}
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="flex items-center gap-1.5">
                  {(['1', '2', '3', '5'] as const).map((quickId) => {
                    const isSelected = String(selectedMainId) === String(quickId);
                    return (
                      <button
                        key={quickId}
                        type="button"
                        onClick={() => {
                          onSelectMainId?.(quickId);
                          setCustomMainIdInput(quickId);
                        }}
                        className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        #{quickId}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Manual Input field to freely type/choose ANY Main ID */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-indigo-300 font-semibold shrink-0">
                {language === 'th' ? 'ระบุ ID หลักอื่น:' : 'Type Main ID:'}
              </span>
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1 text-xs text-indigo-400 font-mono font-bold">#</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customMainIdInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomMainIdInput(val);
                    const clean = val.replace(/[^0-9]/g, '');
                    if (clean && Number(clean) >= 1) {
                      onSelectMainId?.(clean);
                    }
                  }}
                  onBlur={() => {
                    const clean = customMainIdInput.replace(/[^0-9]/g, '');
                    if (!clean || Number(clean) < 1) {
                      setCustomMainIdInput(String(selectedMainId || '1'));
                    }
                  }}
                  className="w-full bg-slate-900 border border-indigo-500/60 rounded-lg pl-6 pr-2 py-0.5 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-indigo-400 transition"
                  placeholder="1"
                />
              </div>
            </div>
          </div>

          {/* Active Target Banner */}
          <div className="bg-indigo-950/50 border border-indigo-500/40 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-300 font-bold">
                {language === 'th' ? 'กำลังดำเนินการรหัสหลัก:' : 'Target Main ID:'}
              </span>
              <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded font-extrabold text-sm">
                #{selectedMainId || '1'}
              </span>
              <span className="text-slate-400 text-[11px]">
                (Rank ปัจจุบัน: <strong className="text-indigo-300">R{currentRank || 1}</strong>)
              </span>
            </div>
            <div className="text-emerald-400 text-[11px] font-bold">
              Vault สิทธิ์อัปแรงค์: {upgradeRankPool.toFixed(2)} USDT
            </div>
          </div>
        </div>
      </div>

      {/* 3 Dedicated Vault Pools for That Specific Main ID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Pool 1: Upgrade Rank Pool */}
        <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3 flex flex-col justify-between space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-amber-400">Upgrade Rank Pool</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-semibold">
              R{window5Start}-R{window5End}
            </span>
          </div>
          <div className="font-mono text-lg font-extrabold text-amber-300">
            {upgradeRankPool.toFixed(2)} <span className="text-xs font-normal text-slate-400">USDT</span>
          </div>
          <div className="text-[10px] text-slate-400 leading-tight">
            {language === 'th'
              ? `ยอดสะสม Vault (35%) ของ 5 rank ย้อนหลัง (สถานะ rank ปัจจุบันของ id #${selectedMainId} ถอยหลัง 5 rank: R${window5Start}-R${window5End})`
              : `Accumulated Vault (35%) of 5 ranks backwards from Rank ${currentRank}`}
          </div>
        </div>

        {/* Pool 2: New Auto ID Pool */}
        <div className="bg-slate-950/80 border border-yellow-500/30 rounded-xl p-3 flex flex-col justify-between space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-yellow-400">New Auto ID Pool</span>
            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold ${
              isMainReady ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/40' : 'bg-slate-800 text-slate-400'
            }`}>
              {isMainReady ? '✓ พร้อมออกรหัส' : `ขาด ${(Math.max(0, 5.0 - newAutoIdPool)).toFixed(2)} U`}
            </span>
          </div>
          <div className="font-mono text-lg font-extrabold text-yellow-300">
            {newAutoIdPool.toFixed(2)} <span className="text-xs font-normal text-slate-400">/ 5.00 USDT</span>
          </div>
          <div className="text-[10px] text-slate-400 leading-tight">
            {language === 'th'
              ? '(ยอดสะสม Vault 1-3) ลบ (5 rank ย้อนหลัง)'
              : 'Vault (35%) in Rank 1-3 minus 5 ranks backwards'}
          </div>
        </div>

        {/* Pool 3: New Extra ID Pool */}
        <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-3 flex flex-col justify-between space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-cyan-400">New Extra ID Pool</span>
            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold ${
              isExtraReady ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40' : 'bg-slate-800 text-slate-400'
            }`}>
              {isExtraReady ? `🔓 ปลดล็อก R${targetExtraRank}` : `ขาด ${(Math.max(0, targetExtraPrice - newExtraIdPool)).toFixed(2)} U (R${targetExtraRank})`}
            </span>
          </div>
          <div className="font-mono text-lg font-extrabold text-cyan-300">
            {newExtraIdPool.toFixed(2)} <span className="text-xs font-normal text-slate-400">/ {targetExtraPrice}.00 USDT</span>
          </div>
          <div className="text-[10px] text-slate-400 leading-tight">
            {language === 'th'
              ? `เงื่อนไข Auto Extra ID: นำยอด New Extra ID Pool มาลูปหาราคาแต่ละ Rank จาก Rank 27 ลงมาถึง Rank 2 (เป้าหมาย R${targetExtraRank}: ${targetExtraPrice} USDT)`
              : `Loops New Extra ID Pool from Rank 27 down to Rank 2 to match Rank price (Target R${targetExtraRank}: ${targetExtraPrice} USDT)`}
          </div>
        </div>
      </div>

      {/* Tier Group Tabs (Ranks 2-10, 11-20, 21-27) */}
      <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
        {(['Starter (1-10)', 'Growth (11-20)', 'Whale (21-27)'] as const).map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => setTierGroupTab(group)}
            className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition cursor-pointer ${
              tierGroupTab === group ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            {group}
          </button>
        ))}
      </div>

      {/* Rank Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-3 max-h-56 overflow-y-auto pr-1">
        {visibleRanks.map((r) => {
          const isCurrent = currentRank === r.rank;
          const isPassed = currentRank > r.rank;
          const isNextStep = r.rank === (currentRank || 1) + 1;
          const isSelected = selectedRank === r.rank;

          return (
            <div
              key={r.rank}
              onClick={() => setSelectedRank(r.rank)}
              className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-indigo-950/50 border-indigo-500 shadow-lg shadow-indigo-950/50'
                  : isNextStep
                  ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-400'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              } ${isPassed ? 'opacity-65' : ''}`}
            >
              {isSelected && (
                <div className="absolute -top-1.5 -right-1.5 bg-indigo-500 text-white rounded-full p-0.5 shadow">
                  <Check className="w-3 h-3" />
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Rank {r.rank}</span>
                {isNextStep && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                    Next Step
                  </span>
                )}
              </div>

              <div className="font-mono text-sm font-bold text-amber-400 mt-1">
                {r.priceUSDT.toLocaleString()} USDT
              </div>

              <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400 space-y-0.5 font-mono">
                <div className="flex justify-between">
                  <span>Direct 30%:</span>
                  <span className="text-emerald-400">{(r.priceUSDT * 0.3).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vault 35%:</span>
                  <span className="text-indigo-300">{(r.priceUSDT * 0.35).toFixed(1)}</span>
                </div>
              </div>

              {isCurrent ? (
                <div className="mt-1.5 text-center text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 py-0.5 rounded border border-emerald-500/20">
                  ✓ Current Rank
                </div>
              ) : isPassed ? (
                <div className="mt-1.5 text-center text-[9px] font-semibold text-indigo-300 bg-indigo-500/10 py-0.5 rounded border border-indigo-500/20">
                  ✓ Achieved
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Selected Rank Action Summary & Smart Contract Auto-ID Triggers */}
      {targetRankDef && (
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 space-y-3">
          {currentRank >= 27 ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {language === 'th'
                  ? `👑 รหัสหลัก #${selectedMainId} อยู่ใน Rank สูงสุด (Rank 27 - Max Rank) เรียบร้อยแล้ว`
                  : `👑 Main ID #${selectedMainId} is already at Max Rank (Rank 27)`}
              </span>
            </div>
          ) : currentRank >= targetRankDef.rank ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {language === 'th'
                    ? `✓ รหัสหลัก #${selectedMainId} ผ่าน Rank ${targetRankDef.rank} เรียบร้อยแล้ว (ปัจจุบันอยู่ Rank ${currentRank})`
                    : `✓ Main ID #${selectedMainId} already achieved Rank ${targetRankDef.rank} (Currently at Rank ${currentRank})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRank(Math.min(27, currentRank + 1))}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer shadow"
              >
                {language === 'th'
                  ? `สลับไป Next Step (Rank ${Math.min(27, currentRank + 1)})`
                  : `Switch to Next Step (Rank ${Math.min(27, currentRank + 1)})`}
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-sm font-bold text-slate-200">
                  {language === 'th'
                    ? `อัปเกรดสู่ Rank ${targetRankDef.rank} (${targetRankDef.priceUSDT.toLocaleString()} USDT)`
                    : `Upgrade to Rank ${targetRankDef.rank} (${targetRankDef.priceUSDT.toLocaleString()} USDT)`}
                </span>
              </div>

              <button
                onClick={handleUpgradeClick}
                disabled={isLoading}
                className="w-full sm:w-auto min-w-[190px] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-2.5 px-5 rounded-xl transition duration-200 text-xs shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="truncate">{currentStep || 'Upgrading...'}</span>
                  </>
                ) : (
                  <>
                    <span>
                      {language === 'th'
                        ? `อัปเกรดสู่ Rank ${selectedRank} (${targetRankDef.priceUSDT.toLocaleString()} USDT)`
                        : `Upgrade Rank ${selectedRank} (${targetRankDef.priceUSDT.toLocaleString()} USDT)`}
                    </span>
                    <ArrowUpRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Vault Deducted vs Difference Breakdown */}
          {(() => {
            const rankPriceVal = targetRankDef.priceUSDT;
            const vaultDeductedVal = Math.min(rankPriceVal, upgradeRankPool || 0);
            const diffToPayVal = Math.max(0, rankPriceVal - vaultDeductedVal);
            return (
              <div className="bg-slate-900/90 border border-indigo-500/30 rounded-lg p-2.5 text-xs font-mono flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400">
                    ราคา Rank {selectedRank}: <strong className="text-slate-200">{rankPriceVal.toLocaleString()} USDT</strong>
                  </span>
                  <span>•</span>
                  <span className="text-emerald-400">
                    หัก Vault (35%): <strong>-{vaultDeductedVal.toFixed(2)} USDT</strong>
                  </span>
                  <span>•</span>
                  <span className="text-amber-300 font-bold">
                    ส่วนต่างที่ชำระเพิ่ม: <strong className="text-amber-400">{diffToPayVal.toFixed(2)} USDT</strong>
                  </span>
                </div>
                <div className="text-[10px] text-indigo-300">
                  {diffToPayVal > 0
                    ? `(ระบบจะตรวจสอบและอนุมัติวงเงินส่วนต่าง ${diffToPayVal.toFixed(2)} USDT อัตโนมัติ)`
                    : '✓ Vault ครบ 100% ไม่ต้องชำระส่วนต่างเพิ่ม'}
                </div>
              </div>
            );
          })()}

          {/* Trigger Auto IDs for That Main ID */}
          {(onProcessAutoNewMainId || onProcessAutoExtraId) && (
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-300 font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {language === 'th'
                        ? `ปลดล็อก Auto ID ของรหัสหลัก #${selectedMainId} (จาก Vault เงินแยก):`
                        : `Auto ID for Main ID #${selectedMainId} (0 Wallet USDT):`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAutoIdInfo(!showAutoIdInfo)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 underline ml-1 cursor-pointer"
                    >
                      {showAutoIdInfo ? (language === 'th' ? '✕ ซ่อนเงื่อนไข' : '✕ Hide Info') : (language === 'th' ? 'ℹ️ เงื่อนไขการเกิด' : 'ℹ️ Rules')}
                    </button>
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onProcessAutoNewMainId?.(selectedMainId)}
                    disabled={isLoading || !account}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 border ${
                      isMainReady
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)] hover:bg-amber-500/30'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                    title={
                      isMainReady
                        ? `กดเพื่อสร้าง Auto New Main ID สำหรับรหัสหลัก #${selectedMainId} ทันที`
                        : `ยอดสะสม New Auto ID Pool ปัจจุบัน ${(newAutoIdPool || 0).toFixed(2)}/5.00 USDT (ยังไม่ถึงเกณฑ์ 5.00 USDT)`
                    }
                  >
                    <span className={`w-2 h-2 rounded-full ${isMainReady ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span>
                      + Auto New Main ID ({(newAutoIdPool || 0).toFixed(2)}/5.00 U)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onProcessAutoExtraId?.(targetExtraRank, selectedMainId)}
                    disabled={isLoading || !account}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 border ${
                      isExtraReady
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.25)] hover:bg-cyan-500/30'
                        : 'bg-slate-900 hover:bg-slate-800 text-cyan-300/80 border-cyan-500/30'
                    }`}
                    title={
                      isExtraReady
                        ? `ปลดล็อกสิทธิ์แล้ว! นำยอด New Extra ID Pool ลูปจาก Rank 27 ลงมาถึง Rank 2 พบราคาตรงกับ Rank ${targetExtraRank} (${targetExtraPrice} USDT) กดเพื่อสร้าง Auto Extra ID ทันที`
                        : `เงื่อนไข Auto Extra ID: นำยอด New Extra ID Pool มาลูปหาราคาแต่ละ Rank จาก Rank 27 ลงมาถึง Rank 2 (ขั้นต่ำ Rank 2 = 10 USDT, ปัจจุบันมี ${(newExtraIdPool || 0).toFixed(2)} USDT)`
                    }
                  >
                    <span className={`w-2 h-2 rounded-full ${isExtraReady ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span>
                      {isExtraReady
                        ? `🔓 ปลดล็อก + Auto Extra ID (ลูป R27→R2 ได้ R${targetExtraRank}: ${(newExtraIdPool || 0).toFixed(2)}/${targetExtraPrice} U)`
                        : `+ Auto Extra ID (ลูป R27→R2 • R${targetExtraRank}: ${(newExtraIdPool || 0).toFixed(2)}/${targetExtraPrice} U)`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Core Rule Explanation */}
              {showAutoIdInfo && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                  <div className="font-bold text-amber-300">
                    📐 กฎและสูตรการคำนวณ 3 Pools (แยกตาม &quot;Idหลักนั้นๆ&quot; โดยเฉพาะ ไม่ใช่ยอดรวมทั้งกระเป๋า):
                  </div>
                  <p className="text-[10px] text-slate-400">
                    <strong className="text-indigo-300">คำนิยามไอดีหลัก:</strong> ระบบคำนวณแยกตาม &quot;Idหลักนั้นๆ&quot; โดยเฉพาะ ไม่ใช่ยอดรวมทั้งกระเป๋า เนื่องจาก 1 กระเป๋าเงินสามารถถือครองได้หลายรหัสหลัก (ทั้งจากการสมัครตรง และจาก Auto New Main ID)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    <strong className="text-emerald-300">คำนิยาม 5 rank ย้อนหลัง:</strong> สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank (ยกตัวอย่าง ถ้าสถานะไอดี #6 อยู่ rank 6 ก็ให้รวมยอด Vault 35% ของ rank 2-6)
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>
                      <strong className="text-amber-400">1. Upgrade Rank Pool:</strong> ยอดสะสม Vault (35%) ของ 5 rank ย้อนหลัง (ของ ID #{selectedMainId} ปัจจุบันคือ R{window5Start} - R{window5End}) ถูกนำมาใช้ปลดล็อกอัปเกรดสู่แรงค์ถัดไปโดยอัตโนมัติ
                    </li>
                    <li>
                      <strong className="text-yellow-400">2. New Auto ID Pool:</strong> ยอดสะสม Vault (35%) ใน Rank 1 ถึง 3 ลบด้วย 5 rank ย้อนหลังของรหัสหลักนั้น (สะสมครบ 5.00 USDT ปลดล็อกสิทธิ์สร้าง Auto New Main ID ทันที เงินแยก ไม่ใช้เหรียญในกระเป๋า)
                    </li>
                    <li>
                      <strong className="text-cyan-400">3. New Extra ID Pool (เงื่อนไขการเกิด Auto Extra ID):</strong>
                      <span className="block mt-0.5 text-slate-200">
                        • <strong className="text-cyan-300">การเกิด:</strong> นำยอด New Extra ID Pool มาลูปหาราคาแต่ละ Rank จาก <strong>Rank 27 ลงมาถึง Rank 2</strong> เมื่อยอดสะสมถึงราคาของ Rank ใดจะปลดล็อกสร้าง Auto Extra ID ใน Rank นั้นทันที
                      </span>
                      <span className="block text-slate-200">
                        • <strong className="text-emerald-300">การใช้เงิน:</strong> ใช้เงินจาก Pool ของรหัสหลักนั้นโดยตรง ไม่หักเหรียญ USDT ในกระเป๋าส่วนตัว
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ประวัติการอัพแรงค์ (Rank Upgrade History from Database) */}
      <div className="bg-slate-950/90 border border-indigo-500/30 rounded-xl p-3.5 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2 flex-wrap">
            <History className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-amber-300">
              {language === 'th' ? '📜 ประวัติการอัพแรงค์ (Database)' : '📜 Rank Upgrade History (Database)'}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              {upgradeLogs.length} {language === 'th' ? 'รายการ' : 'Upgrades'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setHistoryFilter('all')}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                historyFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {language === 'th' ? `ทั้งหมด (${upgradeLogs.length})` : `All (${upgradeLogs.length})`}
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter('mainId')}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                historyFilter === 'mainId'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {language === 'th'
                ? `เฉพาะ Main ID #${selectedMainId} (${
                    upgradeLogs.filter((u) => String(u.mainNodeId) === String(selectedMainId)).length
                  })`
                : `Main ID #${selectedMainId}`}
            </button>
            <button
              type="button"
              onClick={() => fetchUpgradeHistory(true)}
              disabled={isLoadingHistory}
              className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              title="รีเฟรชประวัติอัพแรงค์จากฐานข้อมูล"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {(() => {
          const displayedUpgrades =
            historyFilter === 'mainId'
              ? upgradeLogs.filter((u) => String(u.mainNodeId) === String(selectedMainId))
              : upgradeLogs;

          if (displayedUpgrades.length === 0) {
            return (
              <div className="py-3 text-center text-[11px] text-slate-500 font-mono">
                {language === 'th'
                  ? historyFilter === 'mainId'
                    ? `ยังไม่มีประวัติการอัพแรงค์สำหรับ Main ID #${selectedMainId}`
                    : 'ยังไม่มีประวัติการอัพแรงค์ในระบบ'
                  : 'No rank upgrade history found'}
              </div>
            );
          }

          return (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {displayedUpgrades.map((up) => {
                const modeBadge =
                  up.upgradeMode === 'AUTO_VAULT'
                    ? {
                        label: language === 'th' ? 'Auto Vault 100%' : 'Auto Vault 100%',
                        cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                      }
                    : up.upgradeMode === 'HYBRID_VAULT_WALLET'
                    ? {
                        label: language === 'th' ? 'หัก Vault + จ่ายส่วนต่าง' : 'Vault + Wallet Diff',
                        cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                      }
                    : up.upgradeMode === 'CLONE_IN_RANK'
                    ? {
                        label: language === 'th' ? 'รหัสโคลนในแรงค์' : 'Rank Clone',
                        cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
                      }
                    : {
                        label: language === 'th' ? 'อัปเกรดผ่านกระเป๋า' : 'Manual Wallet',
                        cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
                      };

                return (
                  <div
                    key={up.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap font-mono">
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                          Main ID #{up.mainNodeId}
                        </span>
                        <span className="font-bold text-amber-300">
                          Rank {up.fromRank} ➔ Rank {up.toRank}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300">
                          Node #{up.newNodeId} (R{up.toRank})
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${modeBadge.cls}`}>
                          {modeBadge.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                        <span>
                          {language === 'th' ? 'วางใต้:' : 'Parent:'} #{up.parentId} (
                          {up.side === 'LEFT' ? 'ซ้าย 30%/35%' : 'ขวา Rebirth'})
                        </span>
                        <span>•</span>
                        <span>
                          {language === 'th' ? 'กระเป๋า:' : 'Owner:'}{' '}
                          {up.owner.slice(0, 6)}...{up.owner.slice(-4)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 font-mono">
                      <div className="text-right space-y-0.5">
                        <div className="text-xs font-bold text-amber-400">
                          {up.rankPriceUsdt} USDT
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 justify-end">
                          {parseFloat(up.vaultDeductedUsdt) > 0 && (
                            <span className="text-emerald-400">
                              หัก Vault: -{up.vaultDeductedUsdt} U
                            </span>
                          )}
                          {parseFloat(up.walletPaidUsdt) > 0 && (
                            <span className="text-indigo-300">
                              ส่วนต่าง: {up.walletPaidUsdt} U
                            </span>
                          )}
                        </div>
                      </div>
                      <a
                        href={`https://testnet.bscscan.com/address/${CONTRACT_ADDRESS}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="ดูข้อมูลบน BSCScan Testnet"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
