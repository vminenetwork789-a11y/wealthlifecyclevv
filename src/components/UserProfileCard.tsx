import React from 'react';
import { UserProfile } from '../types';
import { USDT_ADDRESS } from '../contracts/config';
import {
  Copy,
  Check,
  Coins,
  Fuel,
  ExternalLink,
  ShieldCheck,
  Award,
  GitBranch,
  Vault,
} from 'lucide-react';

interface UserProfileCardProps {
  account: string | null;
  profile: UserProfile | null;
  isLoading: boolean;
  usdtBalance: string;
  bnbBalance: string;
  allowance: string;
  language: 'th' | 'en';
  selectedInspectRank?: number;
  selectedVaultBalance?: string;
  selectedMainId?: string | number;
  ownedMainIds?: string[];
  onSelectMainId?: (mainId: string) => void;
  upgradeRankPool?: number;
  newAutoIdPool?: number;
  newExtraIdPool?: number;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({
  account,
  profile,
  usdtBalance,
  bnbBalance,
  language,
  selectedInspectRank = 1,
  selectedVaultBalance = '0.00 USDT',
  selectedMainId = '1',
  ownedMainIds = [],
  onSelectMainId,
  upgradeRankPool,
  newAutoIdPool,
  newExtraIdPool,
}) => {
  const [copied, setCopied] = React.useState(false);

  const copyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sponsorDisplay =
    !profile?.sponsor || profile.sponsor === '0x0000000000000000000000000000000000000000'
      ? 'None (Root)'
      : `${profile.sponsor.substring(0, 6)}...${profile.sponsor.substring(
          profile.sponsor.length - 4
        )}`;

  const shortAccountMobile = account
    ? `${account.substring(0, 10)}...${account.substring(account.length - 8)}`
    : '';

  const formattedUsdt = React.useMemo(() => {
    const num = Number(usdtBalance);
    if (!Number.isFinite(num)) return usdtBalance;
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [usdtBalance]);

  return (
    <div className="space-y-3 sm:space-y-4 w-full min-w-0">
      {/* Top 4 Dashboard Stats Overview Cards: 2x2 grid on mobile, 4 columns on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: User Status */}
        <div className="bg-slate-900/90 border border-emerald-500/25 p-3.5 sm:p-5 rounded-2xl shadow-lg shadow-emerald-950/20 min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold truncate">
              {language === 'th' ? 'สถานะสมาชิก' : 'User Status'}
            </p>
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
          </div>
          <h3
            id="statStatus"
            className="text-base sm:text-xl font-bold text-slate-100 mt-1.5 sm:mt-2 truncate"
          >
            {profile?.isRegistered ? 'Registered' : 'Unregistered'}
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1 truncate">
            Sponsor:{' '}
            <span id="statSponsor" className="font-mono text-slate-200">
              {sponsorDisplay}
            </span>
          </p>
        </div>

        {/* Card 2: Current Max Rank */}
        <div className="bg-slate-900/90 border border-emerald-500/25 p-3.5 sm:p-5 rounded-2xl shadow-lg shadow-emerald-950/20 min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold truncate">
              {language === 'th' ? 'แรงค์สูงสุด' : 'Current Max Rank'}
            </p>
            <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
          </div>
          <h3
            id="statRank"
            className="text-base sm:text-xl font-bold text-emerald-400 mt-1.5 sm:mt-2 font-mono tabular-nums truncate"
          >
            Rank {profile?.currentMaxRank || 1} / 27
          </h3>
        </div>

        {/* Card 3: Rank 1 Node Info */}
        <div className="bg-slate-900/90 border border-teal-500/25 p-3.5 sm:p-5 rounded-2xl shadow-lg shadow-teal-950/20 min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold truncate">
              {language === 'th' ? 'รหัสหลักของกระเป๋า (Rank 1)' : 'Rank 1 Main Node IDs'}
            </p>
            <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-400 shrink-0" />
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-300 font-bold">เลือก ID:</span>
              {ownedMainIds && ownedMainIds.length > 0 ? (
                ownedMainIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectMainId?.(id)}
                    className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded transition cursor-pointer ${
                      String(selectedMainId) === String(id)
                        ? 'bg-teal-500/30 text-teal-200 border border-teal-400 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                    }`}
                  >
                    #{id}
                  </button>
                ))
              ) : (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm font-bold text-teal-400">
                    #{selectedMainId || '1'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1 truncate">
            {profile?.ownedCloneIdsRank1 && profile.ownedCloneIdsRank1.length > 0 ? (
              <>
                Clone IDs:{' '}
                <span id="statLatestId" className="font-mono text-emerald-300 font-semibold">
                  {profile.ownedCloneIdsRank1.map((id) => `#${id}`).join(', ')}
                </span>
              </>
            ) : (
              <>
                Latest ID:{' '}
                <span id="statLatestId" className="font-mono text-slate-200 font-semibold">
                  {profile?.latestCloneIdRank1 && profile.latestCloneIdRank1 !== '0'
                    ? `#${profile.latestCloneIdRank1}`
                    : '-'}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Card 4: Vault Balance & Pools Scoped to Main ID */}
        <div className="bg-slate-900/90 border border-amber-500/30 p-3.5 sm:p-5 rounded-2xl shadow-lg shadow-amber-950/20 min-w-0 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold truncate">
              {upgradeRankPool !== undefined
                ? `Upgrade Pool (#${selectedMainId})`
                : `Vault (Rank ${selectedInspectRank})`}
            </p>
            <Vault className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
          </div>
          <h3
            id="statVault"
            className="text-base sm:text-xl font-bold text-amber-400 mt-1.5 sm:mt-2 font-mono tabular-nums truncate"
          >
            {upgradeRankPool !== undefined
              ? `${upgradeRankPool.toFixed(2)} USDT`
              : selectedVaultBalance}
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">
            {newAutoIdPool !== undefined
              ? `Auto: ${newAutoIdPool.toFixed(2)}U • Extra: ${(newExtraIdPool || 0).toFixed(2)}U`
              : `Rank ${selectedInspectRank} Vault Balance`}
          </p>
        </div>
      </div>

      {/* Wallet Bar & Balances Summary — Zero horizontal overflow on mobile & PC */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:px-5 sm:py-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 min-w-0 overflow-hidden">
        {/* Left: Connected Wallet Address */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5 min-w-0">
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap shrink-0">
            {language === 'th' ? 'กระเป๋าที่เชื่อมต่อ:' : 'Connected Wallet:'}
          </span>

          {account ? (
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800/90 rounded-xl px-3 py-1.5 min-w-0 max-w-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              {/* Truncated on small mobile, full on larger viewports */}
              <span className="font-mono text-xs font-semibold text-emerald-300 truncate sm:hidden">
                {shortAccountMobile}
              </span>
              <span className="hidden sm:inline font-mono text-xs sm:text-sm font-semibold text-emerald-300 truncate">
                {account}
              </span>

              <div className="flex items-center gap-1 ml-auto pl-1.5 border-l border-slate-800 shrink-0">
                <button
                  onClick={copyAddress}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  title={language === 'th' ? 'คัดลอกที่อยู่กระเป๋า' : 'Copy address'}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={`https://testnet.bscscan.com/address/${account}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition"
                  title="View on BSCScan Testnet"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-500 italic">
              {language === 'th'
                ? 'ยังไม่ได้เชื่อมต่อกระเป๋าเงิน (Not Connected)'
                : 'Not Connected'}
            </span>
          )}
        </div>

        {/* Right: USDT & Gas Balances */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 text-xs min-w-0">
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 sm:py-1.5 flex items-center justify-between sm:justify-start gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400">USDT:</span>
            </div>
            <span
              className="font-mono font-bold text-emerald-400 tabular-nums truncate"
              title={`${usdtBalance} USDT`}
            >
              {formattedUsdt}
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 sm:py-1.5 flex items-center justify-between sm:justify-start gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Fuel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-slate-400">Gas:</span>
            </div>
            <span className="font-mono font-bold text-amber-400 tabular-nums whitespace-nowrap">
              {bnbBalance} tBNB
            </span>
          </div>

          <a
            href={`https://testnet.bscscan.com/token/${USDT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-slate-400 hover:text-amber-300 font-mono hidden xl:inline-flex items-center gap-1 transition"
          >
            <span>USDT: {USDT_ADDRESS.substring(0, 8)}...</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
