import React, { useState } from 'react';
import {
  Wallet,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LogOut,
  RefreshCw,
  Search,
  Layers,
  Copy,
  Check,
  Eye,
  KeyRound,
  Network,
} from 'lucide-react';
import { RegisterSection } from './RegisterSection';
import { MatrixTreeVisualizer } from './MatrixTreeVisualizer';
import { ApplicantItem, PlacementMode } from '../utils/offChainSimulator';
import { UserProfile } from '../types';

interface AuthAndOnboardingGateProps {
  mode: 'login' | 'Checking' | 'register_onboarding';
  language: 'th' | 'en';
  onToggleLanguage: () => void;
  account: string | null;
  detectedBrowserWallet: string | null;
  chainId: number | null;
  isBscTestnet: boolean;
  isConnecting: boolean;
  isLoadingProfile: boolean;
  profile: UserProfile | null;
  usdtBalance: string;
  bnbBalance: string;
  allowance: string;
  contractAddress: string;
  usdtAddress: string;
  txState: {
    isLoading: boolean;
    step: string;
    txHash: string | null;
    error: string | null;
    successMessage: string | null;
  };
  onClearTxState: () => void;
  onConnectWallet: () => void;
  onLoginCustomInput: (input: string) => Promise<boolean>;
  onLoginDemoUnregisteredWallet: () => Promise<void>;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
  onRefresh: () => void;
  onEnterGuestDashboard: () => void;
  onApproveUsdt: (amountUsdt?: number) => Promise<any>;
  onRegister: (
    sponsorNodeId: number,
    autoOptions?: {
      targetParentId?: number | string;
      isLeft?: boolean;
      mode?: PlacementMode;
    }
  ) => Promise<any>;
  onExecuteOffChainBatch: (
    sponsorNodeId: number,
    applicantsQueue: ApplicantItem[],
    onStatusCallback?: (msg: string) => void,
    mode?: PlacementMode
  ) => Promise<any>;
  onCheckSponsor: (
    sponsorNodeId: number
  ) => Promise<{ isValid: boolean; reason: string; sponsorAddress: string }>;
  onPreviewPlacement: (
    rank: number,
    sponsorAddr: string
  ) => Promise<{ targetParentId: string; isLeft: boolean; activeRound: number } | null>;
  onUpgradeToRank: (rank: number) => Promise<any>;
}

export const AuthAndOnboardingGate: React.FC<AuthAndOnboardingGateProps> = ({
  mode,
  language,
  onToggleLanguage,
  account,
  detectedBrowserWallet,
  chainId,
  isBscTestnet,
  isConnecting,
  profile,
  usdtBalance,
  bnbBalance,
  allowance,
  contractAddress,
  usdtAddress,
  txState,
  onClearTxState,
  onConnectWallet,
  onLoginCustomInput,
  onLoginDemoUnregisteredWallet,
  onDisconnect,
  onSwitchNetwork,
  onRefresh,
  onEnterGuestDashboard,
  onApproveUsdt,
  onRegister,
  onExecuteOffChainBatch,
  onCheckSponsor,
  onPreviewPlacement,
  onUpgradeToRank,
}) => {
  const [customLoginInput, setCustomLoginInput] = useState<string>('');
  const [copiedWallet, setCopiedWallet] = useState<boolean>(false);
  const [showLiveTreeOnRegisterPage, setShowLiveTreeOnRegisterPage] = useState<boolean>(true);

  const handleCopyWallet = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 1800);
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customLoginInput.trim()) return;
    await onLoginCustomInput(customLoginInput);
  };

  // ============================================================================
  // 1. หน้าเข้าสู่ระบบ (WEB3 LOGIN SCREEN)
  // ============================================================================
  if (mode === 'login') {
    return (
      <div className="min-h-screen w-full bg-[#070b16] text-slate-100 flex flex-col justify-between relative overflow-hidden">
        {/* Background Ambient Glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[680px] h-[360px] bg-emerald-500/10 blur-[130px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[320px] bg-indigo-500/10 blur-[130px] rounded-full" />
        </div>

        {/* Top Bar */}
        <header className="relative z-10 w-full border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 via-teal-500/20 to-indigo-500/25 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-mono font-black text-lg shadow-lg shadow-emerald-950/50">
                F27
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-300 bg-clip-text text-transparent">
                  FractalFlowMatrix27
                </h1>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="text-emerald-400 font-medium">BNB Smart Chain Testnet (97)</span>
                  <span>•</span>
                  <a
                    href={`https://testnet.bscscan.com/address/${contractAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-amber-400 hover:underline inline-flex items-center gap-1"
                  >
                    {contractAddress.substring(0, 6)}...{contractAddress.substring(contractAddress.length - 4)}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onEnterGuestDashboard}
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">
                  {language === 'th' ? 'ดูผังโครงสร้างรวม' : 'Preview Matrix'}
                </span>
              </button>
              <button
                onClick={onToggleLanguage}
                className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl font-mono text-slate-200 transition cursor-pointer"
              >
                {language === 'th' ? '🇬🇧 EN' : '🇹🇭 TH'}
              </button>
            </div>
          </div>
        </header>

        {/* Main Centered Login Content */}
        <main className="relative z-10 flex-grow flex items-center justify-center px-4 py-8 sm:py-12">
          <div className="w-full max-w-xl space-y-6">
            {/* Error / Status Toast */}
            {txState.error && (
              <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex items-start justify-between gap-3 shadow-lg">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-300 mb-0.5">
                      {language === 'th' ? 'แจ้งเตือนการเข้าสู่ระบบ' : 'Login Notice'}
                    </div>
                    <p className="leading-relaxed">{txState.error}</p>
                  </div>
                </div>
                <button
                  onClick={onClearTxState}
                  className="text-rose-400 hover:text-white text-xs font-bold px-2 py-0.5"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Login Hero Card */}
            <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 backdrop-blur-xl space-y-6">
              {/* Title */}
              <div className="text-center">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  {language === 'th' ? 'เข้าสู่ระบบ FractalFlow Matrix 27' : 'Sign In to FractalFlow Matrix 27'}
                </h2>
              </div>

              {/* Detected Browser Wallet Banner */}
              {detectedBrowserWallet && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/35 border border-emerald-500/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-emerald-300 font-semibold">
                        {language === 'th'
                          ? 'ตรวจพบกระเป๋า Web3 ในเบราว์เซอร์ของคุณ:'
                          : 'Detected Browser Wallet:'}
                      </div>
                      <div className="text-xs font-mono text-white truncate">
                        {detectedBrowserWallet}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onConnectWallet}
                    disabled={isConnecting}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shrink-0 transition cursor-pointer"
                  >
                    {language === 'th' ? 'ใช้กระเป๋านี้' : 'Use Wallet'}
                  </button>
                </div>
              )}

              {/* Primary Button: Connect Web3 Wallet */}
              <div className="space-y-3">
                <button
                  onClick={onConnectWallet}
                  disabled={isConnecting}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white font-bold text-base shadow-xl shadow-emerald-950/60 border border-emerald-400/30 transition duration-200 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
                >
                  {isConnecting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>
                        {language === 'th'
                          ? 'กำลังเชื่อมต่อและตรวจสอบข้อมูลบนบล็อกเชน...'
                          : 'Connecting & Verifying Wallet...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Wallet className="w-5 h-5" />
                      <span>
                        {language === 'th'
                          ? 'เข้าสู่ระบบด้วยกระเป๋า Web3 (MetaMask / TrustWallet)'
                          : 'Login with Web3 Wallet (MetaMask / TrustWallet)'}
                      </span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-800" />
                <span className="shrink-0 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                  {language === 'th'
                    ? 'หรือ เข้าสู่ระบบด้วยเลขกระเป๋า 0x... / รหัสสมาชิก #ID'
                    : 'OR LOGIN WITH WALLET ADDRESS / NODE ID'}
                </span>
                <div className="flex-grow border-t border-slate-800" />
              </div>

              {/* Manual Address or Node ID Login Form */}
              <form onSubmit={handleCustomSubmit} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-grow">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={customLoginInput}
                      onChange={(e) => setCustomLoginInput(e.target.value)}
                      placeholder={
                        language === 'th'
                          ? 'วางเลขกระเป๋า 0x... หรือพิมพ์รหัสสมาชิก เช่น 1, 2'
                          : 'Paste wallet 0x... or enter Node ID e.g. 1, 2'
                      }
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isConnecting || !customLoginInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm transition inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Search className="w-4 h-4" />
                    <span>{language === 'th' ? 'ตรวจสอบ & เข้าสู่ระบบ' : 'Check & Login'}</span>
                  </button>
                </div>

                {/* Quick Action Pills for Testing */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onLoginDemoUnregisteredWallet}
                    disabled={isConnecting}
                    className="flex-1 min-w-[200px] py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-semibold transition inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      {language === 'th'
                        ? 'จำลองกระเป๋าใหม่ (ทดสอบหน้าฟอร์มสมัคร)'
                        : 'Test New Unregistered Wallet'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoginCustomInput('1')}
                    disabled={isConnecting}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{language === 'th' ? 'เข้าด้วยรหัส #1 (Root)' : 'Login as #1 (Root)'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Active Smart Contract Footer Info */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Smart Contract:</span>
                <span className="font-mono text-emerald-300 break-all">{contractAddress}</span>
              </div>
              <button
                onClick={onEnterGuestDashboard}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline shrink-0 cursor-pointer"
              >
                {language === 'th' ? 'เข้าสู่แดชบอร์ดโดยไม่ล็อกอิน →' : 'Continue as Guest →'}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ============================================================================
  // 2. หน้ากำลังตรวจสอบข้อมูลกระเป๋า (CHECKING WALLET ON SMART CONTRACT)
  // ============================================================================
  if (mode === 'Checking') {
    return (
      <div className="min-h-screen w-full bg-[#070b16] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <div className="w-7 h-7 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-white">
              {language === 'th'
                ? 'กำลังตรวจสอบสถานะกระเป๋า...'
                : 'Verifying Wallet...'}
            </h3>
            {account && (
              <p className="text-xs font-mono text-emerald-400 break-all px-2">{account}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. หน้าฟอร์มสมัครสมาชิกสำหรับกระเป๋าที่ยังไม่เคยสมัคร (NEW WALLET REGISTRATION PAGE)
  // ============================================================================
  return (
    <div className="min-h-screen w-full bg-[#070b16] text-slate-100 flex flex-col justify-between">
      {/* Sticky Onboarding Top Bar */}
      <header className="w-full bg-slate-950/95 backdrop-blur-md border-b border-amber-500/30 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-mono font-black text-base">
              F27
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold text-white">
                  {language === 'th'
                    ? 'หน้าฟอร์มสมัครสมาชิกใหม่ (New Member Registration)'
                    : 'New Member Registration Form'}
                </h1>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {language === 'th' ? 'กระเป๋านี้ยังไม่เคยสมัคร' : 'Unregistered Wallet'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Contract:</span>
                <a
                  href={`https://testnet.bscscan.com/address/${contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  {contractAddress.substring(0, 8)}...{contractAddress.substring(contractAddress.length - 6)}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onEnterGuestDashboard}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {language === 'th' ? 'เปิดดูหน้าแดชบอร์ดรวม' : 'View Full Dashboard'}
              </span>
            </button>

            <button
              onClick={onRefresh}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title={language === 'th' ? 'ตรวจสอบสถานะกระเป๋าอีกครั้ง' : 'Refresh Wallet Status'}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onToggleLanguage}
              className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-xl font-mono text-slate-200 transition cursor-pointer"
            >
              {language === 'th' ? '🇬🇧 EN' : '🇹🇭 TH'}
            </button>

            <button
              onClick={onDisconnect}
              className="text-xs px-3 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 font-semibold transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{language === 'th' ? 'สลับกระเป๋า / ออก' : 'Switch Wallet'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Onboarding Body */}
      <main className="flex-grow max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Transaction Notification Toast */}
        {(txState.isLoading || txState.error || txState.successMessage) && (
          <div
            className={`p-4 rounded-2xl text-sm border transition-all relative ${
              txState.isLoading
                ? 'bg-indigo-950/85 border-indigo-500/40 text-indigo-200'
                : txState.error
                ? 'bg-rose-950/85 border-rose-500/40 text-rose-200'
                : 'bg-emerald-950/85 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <button
              onClick={onClearTxState}
              className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded bg-slate-900/60 hover:bg-slate-800 text-slate-300"
            >
              ✕
            </button>
            <div className="flex items-start gap-3">
              {txState.isLoading ? (
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
              ) : txState.error ? (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold">
                  {txState.isLoading
                    ? language === 'th'
                      ? 'กำลังดำเนินการบนบล็อกเชน...'
                      : 'Transaction in Progress...'
                    : txState.error
                    ? language === 'th'
                      ? 'เกิดข้อผิดพลาดในการทำรายการ'
                      : 'Transaction Error'
                    : language === 'th'
                    ? 'สมัครสมาชิกสำเร็จ! กำลังเข้าสู่ระบบ...'
                    : 'Registration Successful!'}
                </div>
                <div className="text-xs opacity-90">
                  {txState.step || txState.error || txState.successMessage}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connected Unregistered Wallet Banner Card */}
        <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/35 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {language === 'th'
                  ? 'สมัครสมาชิกใหม่ Rank 1 (5 USDT)'
                  : 'New Member Registration - Rank 1 (5 USDT)'}
              </h2>
            </div>

            {!isBscTestnet && (
              <button
                onClick={onSwitchNetwork}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 transition cursor-pointer"
              >
                {language === 'th' ? 'สลับเครือข่ายเป็น BSC Testnet (97)' : 'Switch to BSC Testnet'}
              </button>
            )}
          </div>

          {/* Wallet Info & Balances Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-slate-400 font-semibold">
                  {language === 'th' ? 'กระเป๋าที่เชื่อมต่อ (Wallet)' : 'Connected Wallet'}
                </div>
                <div className="text-xs font-mono text-emerald-300 truncate">
                  {account}
                </div>
              </div>
              {account && (
                <button
                  onClick={() => handleCopyWallet(account)}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 shrink-0 cursor-pointer"
                  title="Copy Address"
                >
                  {copiedWallet ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-semibold">
                  {language === 'th' ? 'ยอดคงเหลือ USDT' : 'USDT Balance'}
                </div>
                <div className="text-sm font-bold font-mono text-white">
                  {usdtBalance} <span className="text-xs text-emerald-400">USDT</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">
                  {language === 'th' ? 'ค่าสมัครเริ่มต้น' : 'Entry Cost'}
                </div>
                <div className="text-xs font-mono font-bold text-amber-300">5.00 USDT</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-semibold">
                  {language === 'th' ? 'เหรียญค่าแก๊ส (BNB Testnet)' : 'Gas Balance (tBNB)'}
                </div>
                <div className="text-sm font-bold font-mono text-white">
                  {bnbBalance} <span className="text-xs text-amber-400">tBNB</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">Allowance</div>
                <div className="text-xs font-mono text-indigo-300">
                  {Number(allowance || 0).toFixed(2)} USDT
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated Registration Form Component */}
        <RegisterSection
          account={account}
          isRegistered={profile?.isRegistered ?? false}
          mainNodeIdRank1={profile?.mainNodeIdRank1}
          usdtBalance={usdtBalance}
          allowance={allowance}
          onConnectWallet={onConnectWallet}
          onApproveUsdt={onApproveUsdt}
          onRegister={onRegister}
          onExecuteOffChainBatch={onExecuteOffChainBatch}
          onCheckSponsor={onCheckSponsor}
          onPreviewPlacement={onPreviewPlacement}
          isLoading={txState.isLoading}
          currentStep={txState.step}
          txError={txState.error}
          txSuccess={txState.successMessage}
          language={language}
        />

        {/* Optional Live Matrix Tree Preview on Registration Screen */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowLiveTreeOnRegisterPage((prev) => !prev)}
              className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-xl cursor-pointer"
            >
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>
                {showLiveTreeOnRegisterPage
                  ? language === 'th'
                    ? 'ซ่อนผังโครงสร้าง Binary Matrix 27'
                    : 'Hide Live Matrix Tree'
                  : language === 'th'
                  ? 'ดูผังโครงสร้าง Binary Matrix 27 ประกอบการเลือกผู้แนะนำ'
                  : 'Show Live Matrix Tree to Pick Sponsor'}
              </span>
            </button>
          </div>

          {showLiveTreeOnRegisterPage && (
            <MatrixTreeVisualizer
              language={language}
              userAddress={account}
              chainId={chainId}
              isBscTestnet={isBscTestnet}
              contractAddress={contractAddress}
              onConnectWallet={onConnectWallet}
              onSwitchNetwork={onSwitchNetwork}
              onRegisterWithSponsor={onRegister}
              onUpgradeToRank={onUpgradeToRank}
              lastTxSuccess={txState.successMessage}
              refreshTrigger={txState.successMessage}
            />
          )}
        </div>
      </main>
    </div>
  );
};
