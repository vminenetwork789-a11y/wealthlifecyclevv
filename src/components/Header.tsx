import React from 'react';
import { CONTRACT_ADDRESS } from '../contracts/config';
import {
  ExternalLink,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  LogOut,
} from 'lucide-react';

interface HeaderProps {
  account: string | null;
  chainId: number | null;
  isBscTestnet: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
  onRefresh: () => void;
  language: 'th' | 'en';
  onToggleLanguage: () => void;
  onOpenDeployModal: () => void;
  contractAddress?: string;
}

export const Header: React.FC<HeaderProps> = ({
  account,
  isBscTestnet,
  isConnecting,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
  onRefresh,
  language,
  onToggleLanguage,
  onOpenDeployModal,
  contractAddress,
}) => {
  const shortAddress = account
    ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}`
    : '';
  const currentContract = contractAddress || CONTRACT_ADDRESS;
  const shortContract = `${currentContract.substring(0, 6)}...${currentContract.substring(
    currentContract.length - 4
  )}`;

  return (
    <header className="w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800/90 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 sm:gap-4">
          {/* Top Row on Mobile: Brand Lockup + Language & Refresh */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-indigo-500/20 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-950/40 shrink-0">
                <span className="font-mono font-black text-base sm:text-xl tracking-tighter">
                  F27
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-300 bg-clip-text text-transparent truncate">
                    FractalFlowMatrix27
                  </h1>
                  <span className="hidden sm:inline-flex items-center text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0">
                    DApp Control Panel
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-400 mt-0.5 flex-wrap">
                  <span className="whitespace-nowrap">
                    {language === 'th' ? 'สัญญา:' : 'Contract:'}
                  </span>
                  <a
                    href={`https://testnet.bscscan.com/address/${currentContract}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-400 hover:text-amber-300 font-mono inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                    title={currentContract}
                  >
                    <span>{shortContract}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  <span className="text-slate-600">·</span>
                  <span className="text-emerald-400 font-medium whitespace-nowrap">
                    BNB Testnet (97)
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile-only quick language & refresh controls on top-right */}
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              {account && (
                <button
                  onClick={onRefresh}
                  className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white transition cursor-pointer"
                  title={language === 'th' ? 'รีเฟรชข้อมูลบล็อกเชน' : 'Refresh blockchain data'}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={onToggleLanguage}
                className="text-[11px] bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 px-2.5 py-1.5 rounded-xl font-mono text-slate-200 hover:text-white transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                {language === 'th' ? '🇬🇧 EN' : '🇹🇭 TH'}
              </button>
            </div>
          </div>

          {/* Action Toolbar: Clean single-line pills on mobile & desktop */}
          <div className="flex items-center justify-between md:justify-end gap-2 overflow-x-auto no-scrollbar pt-1 md:pt-0 border-t border-slate-800/60 md:border-t-0">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Deploy Contract Shortcut */}
              <button
                onClick={onOpenDeployModal}
                className="text-[11px] sm:text-xs bg-slate-800/80 hover:bg-slate-700/80 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 px-2.5 sm:px-3 py-1.5 rounded-xl font-medium transition duration-200 inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
                title={
                  language === 'th'
                    ? 'จัดการและทดสอบ Deploy สัญญา'
                    : 'Contract deployment manager'
                }
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{language === 'th' ? 'Deploy สัญญา' : 'Deploy Contract'}</span>
              </button>

              {/* Desktop Language Switch */}
              <button
                onClick={onToggleLanguage}
                className="hidden md:inline-flex text-xs bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 px-2.5 py-1.5 rounded-xl font-mono text-slate-300 hover:text-white transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                {language === 'th' ? '🇬🇧 EN' : '🇹🇭 TH'}
              </button>

              {/* Network Indicator / Switcher */}
              {account &&
                (isBscTestnet ? (
                  <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>BSC Testnet</span>
                  </div>
                ) : (
                  <button
                    onClick={onSwitchNetwork}
                    className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium transition whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{language === 'th' ? 'สลับไป BNB Testnet' : 'Switch Network'}</span>
                  </button>
                ))}

              {/* Desktop Refresh Profile */}
              {account && (
                <button
                  onClick={onRefresh}
                  className="hidden md:inline-flex p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
                  title={language === 'th' ? 'รีเฟรชข้อมูลบล็อกเชน' : 'Refresh blockchain data'}
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Connect / Disconnect Button */}
            {account ? (
              <div className="inline-flex items-center gap-2 bg-slate-950 border border-slate-800 px-2.5 sm:px-3 py-1.5 rounded-xl shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[11px] sm:text-xs font-mono text-slate-200 whitespace-nowrap">
                  {shortAddress}
                </span>
                <button
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-medium transition pl-1.5 border-l border-slate-800 whitespace-nowrap cursor-pointer"
                  title={language === 'th' ? 'ตัดการเชื่อมต่อกระเป๋า' : 'Disconnect Wallet'}
                >
                  <LogOut className="w-3 h-3 sm:hidden" />
                  <span>{language === 'th' ? 'ออก' : 'Exit'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                id="walletBtn"
                className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl transition duration-200 shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isConnecting
                    ? language === 'th'
                      ? 'กำลังเชื่อมต่อ...'
                      : 'Connecting...'
                    : language === 'th'
                    ? 'เชื่อมต่อกระเป๋า'
                    : 'Connect Wallet'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
