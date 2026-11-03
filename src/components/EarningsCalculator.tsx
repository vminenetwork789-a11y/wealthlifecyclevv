import React, { useState } from 'react';
import { Calculator, TrendingUp, Award, DollarSign, Users, Shield, ArrowRight } from 'lucide-react';

interface EarningsCalculatorProps {
  language?: 'th' | 'en';
  currentMaxRank?: number;
}

const RANK_PRICES: number[] = [
  5, 10, 20, 30, 40, 50, 60, 70, 80, 90,
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
  2000, 3000, 4000, 5000, 6000, 8000, 10000,
];

const RANK_NAMES = [
  'Rank 1 ($5)', 'Rank 2 ($10)', 'Rank 3 ($20)', 'Rank 4 ($30)', 'Rank 5 ($40)',
  'Rank 6 ($50)', 'Rank 7 ($60)', 'Rank 8 ($70)', 'Rank 9 ($80)', 'Rank 10 ($90)',
  'Rank 11 ($100)', 'Rank 12 ($200)', 'Rank 13 ($300)', 'Rank 14 ($400)', 'Rank 15 ($500)',
  'Rank 16 ($600)', 'Rank 17 ($700)', 'Rank 18 ($800)', 'Rank 19 ($900)', 'Rank 20 ($1,000)',
  'Rank 21 ($2,000)', 'Rank 22 ($3,000)', 'Rank 23 ($4,000)', 'Rank 24 ($5,000)', 'Rank 25 ($6,000)',
  'Rank 26 ($8,000)', 'Rank 27 ($10,000)'
];

export const EarningsCalculator: React.FC<EarningsCalculatorProps> = ({
  language = 'th',
  currentMaxRank = 1,
}) => {
  const [selectedRank, setSelectedRank] = useState<number>(Math.min(Math.max(currentMaxRank, 1), 27));
  const [directReferrals, setDirectReferrals] = useState<number>(5);
  const [teamDepth, setTeamDepth] = useState<number>(3);
  const [avgDownlinesPerTier, setAvgDownlinesPerTier] = useState<number>(3);

  const rankPrice = RANK_PRICES[selectedRank - 1] || 5;

  // Calculation formulas
  // 1. Direct Bonus: 30% per direct referral joining at this rank
  const directEarnings = directReferrals * (rankPrice * 0.3);

  // 2. Level / Unilevel Bonus: 2% per member across team depth tiers (1 to 15)
  let totalTeamMembers = 0;
  let levelEarnings = 0;
  let currentTierCount = avgDownlinesPerTier;
  for (let t = 1; t <= Math.min(teamDepth, 15); t++) {
    totalTeamMembers += currentTierCount;
    levelEarnings += currentTierCount * (rankPrice * 0.02);
    currentTierCount *= 2; // Binary tree expansion estimate
  }

  // 3. Vault & Rebirth bonus estimation (35% accumulation)
  const estimatedVaultAccumulation = (directReferrals + totalTeamMembers) * (rankPrice * 0.35 * 0.2);

  const totalProjectedUsdt = directEarnings + levelEarnings + estimatedVaultAccumulation;

  return (
    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
          <Calculator className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100">
            {language === 'th' ? '🧮 เครื่องคำนวณจำลองรายได้ (Earnings Simulator)' : '🧮 Projected Earnings Calculator'}
          </h2>
          <p className="text-xs text-slate-400">
            {language === 'th'
              ? 'คำนวณรายได้คาดการณ์ตามยศและอัตราการเติบโตของทีมเพื่อประเมินความคุ้มค่าในการอัปเกรด'
              : 'Simulate projected earnings based on rank and team growth to evaluate upgrade value proposition.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
              <span>{language === 'th' ? 'เลือกระดับยศเป้าหมาย (Target Rank):' : 'Select Target Rank:'}</span>
              <span className="text-emerald-400 font-bold">${rankPrice} USDT</span>
            </label>
            <select
              value={selectedRank}
              onChange={(e) => setSelectedRank(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {RANK_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name} (Price: ${RANK_PRICES[idx]} USDT)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                <span>{language === 'th' ? 'จำนวนแนะนำตรง (Direct Referrals):' : 'Direct Referrals:'}</span>
                <span className="text-indigo-400 font-bold">{directReferrals} คน</span>
              </label>
              <input
                type="range"
                min="1"
                max="50"
                value={directReferrals}
                onChange={(e) => setDirectReferrals(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>1</span>
                <span>25</span>
                <span>50</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                <span>{language === 'th' ? 'ความลึกสายงาน (Team Depth Tiers):' : 'Team Depth Tiers:'}</span>
                <span className="text-indigo-400 font-bold">{teamDepth} ชั้น</span>
              </label>
              <input
                type="range"
                min="1"
                max="15"
                value={teamDepth}
                onChange={(e) => setTeamDepth(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>Tier 1</span>
                <span>Tier 8</span>
                <span>Tier 15</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
              <span>{language === 'th' ? 'อัตราขยายสมาชิกเฉลี่ยต่อชั้น (Growth Rate):' : 'Downline Growth Multiplier:'}</span>
              <span className="text-indigo-400 font-bold">{avgDownlinesPerTier}x</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={avgDownlinesPerTier}
              onChange={(e) => setAvgDownlinesPerTier(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Results Summary Box */}
        <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
              {language === 'th' ? 'รายได้คาดการณ์รวม (Projected Earnings)' : 'Total Projected Earnings'}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 flex items-baseline gap-1">
              <span>${totalProjectedUsdt.toFixed(2)}</span>
              <span className="text-xs text-slate-400 font-normal">USDT</span>
            </div>
          </div>

          <div className="space-y-2 text-xs border-t border-slate-800 pt-3">
            <div className="flex justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>{language === 'th' ? 'โบนัสแนะนำตรง (30%):' : 'Direct Bonus (30%):'}</span>
              </span>
              <span className="font-bold text-emerald-300">${directEarnings.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                <span>{language === 'th' ? 'โบนัสชั้นลึก (2% x Tiers):' : 'Level Bonus (2%):'}</span>
              </span>
              <span className="font-bold text-indigo-300">${levelEarnings.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>{language === 'th' ? 'สะสมห้องนิรภัย (Vault):' : 'Vault Accumulation:'}</span>
              </span>
              <span className="font-bold text-amber-300">${estimatedVaultAccumulation.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-[11px] text-emerald-200">
            {language === 'th'
              ? `💡 การอัปเกรดถึง Rank ${selectedRank} ช่วยเปิดรับรายได้ลึกสุดถึง ${teamDepth} ชั้น พร้อมสิทธิ์รับ Rebirth โคลนนิ่งอัตโนมัติ`
              : `💡 Upgrading to Rank ${selectedRank} unlocks up to ${teamDepth} reward tiers plus automatic rebirth clone generation.`}
          </div>
        </div>
      </div>
    </div>
  );
};
