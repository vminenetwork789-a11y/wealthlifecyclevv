import React, { useState, useEffect } from 'react';
import { useWeb3 } from './hooks/useWeb3';
import { Header } from './components/Header';
import { UserProfileCard } from './components/UserProfileCard';
import { RegisterSection } from './components/RegisterSection';
import { UpgradeRankSection } from './components/UpgradeRankSection';
import { RankInspectorAndAdminPanel } from './components/RankInspectorAndAdminPanel';
import { MatrixTreeVisualizer } from './components/MatrixTreeVisualizer';
import { EventLogsSection } from './components/EventLogsSection';
import { FAQSection } from './components/FAQSection';
import { DeployContractModal } from './components/DeployContractModal';
import { AuthAndOnboardingGate } from './components/AuthAndOnboardingGate';
import { CONTRACT_ADDRESS, USDT_ADDRESS } from './contracts/config';
import { AlertCircle, CheckCircle2, Loader2, X, ExternalLink, LogIn } from 'lucide-react';
import { calculateMainIdVaultPools } from './utils/vaultPools';

export default function App() {
  const [language, setLanguage] = useState<'th' | 'en'>('th');
  const [isDeployModalOpen, setIsDeployModalOpen] = useState<boolean>(false);
  const [selectedInspectRank, setSelectedInspectRank] = useState<number>(1);
  const [selectedVaultBalance, setSelectedVaultBalance] = useState<string>('0.00 USDT');
  const [bypassGateToDashboard, setBypassGateToDashboard] = useState<boolean>(false);

  const {
    account,
    detectedBrowserWallet,
    chainId,
    isBscTestnet,
    isConnecting,
    usdtBalance,
    bnbBalance,
    allowance,
    profile,
    isLoadingProfile,
    contractAddress,
    usdtAddress,
    updateSmartContractAddress,
    resetSmartContractAddress,
    txState,
    connectWallet,
    loginWithCustomInput,
    loginWithDemoUnregisteredWallet,
    disconnectWallet,
    switchToBscTestnet,
    refreshUserData,
    checkSponsorNode,
    previewNextPlacement,
    inspectRankData,
    handleApproveUsdt,
    handleRegister,
    handleExecuteOffChainSimulationAndBatch,
    handleUpgradeRank,
    handleAdminUpgrade,
    handleProcessAutoNewMainId,
    handleProcessAutoExtraId,
    clearTxState,
  } = useWeb3();

  // Check if connected wallet is already registered on-chain
  const isWalletRegistered = Boolean(
    profile?.isRegistered ||
      (profile?.ownedAllIdsRank1 && profile.ownedAllIdsRank1.length > 0) ||
      (profile?.mainNodeIdRank1 && Number(profile.mainNodeIdRank1) > 0)
  );

  // Whenever account changes, reset bypass so unregistered wallets see the registration form
  useEffect(() => {
    setBypassGateToDashboard(false);
  }, [account]);

  useEffect(() => {
    if (Array.isArray(profile?.vaults) && profile.vaults.length > 0) {
      const targetVault = profile.vaults.find((v: any) => Number(v.rank) === selectedInspectRank);
      if (targetVault) {
        setSelectedVaultBalance(`${Number(targetVault.balance || 0).toFixed(2)} USDT`);
      }
    }
  }, [profile?.vaults, selectedInspectRank]);

  // Scoped Main ID Selection and Vault Pools calculations
  const [selectedMainId, setSelectedMainId] = useState<string>('1');
  const prevAccountRef = React.useRef<string | null>(null);

  useEffect(() => {
    const accountChanged = prevAccountRef.current !== account;
    if (accountChanged) {
      prevAccountRef.current = account;
      if (profile) {
        if (profile.ownedMainIdsRank1 && profile.ownedMainIdsRank1.length > 0) {
          setSelectedMainId(String(profile.ownedMainIdsRank1[0]));
        } else if (profile.mainNodeIdRank1 && profile.mainNodeIdRank1 !== '0') {
          setSelectedMainId(String(profile.mainNodeIdRank1));
        }
      }
    }
  }, [account, profile]);

  const [mainIdVaultsOnChain, setMainIdVaultsOnChain] = useState<Record<number, number>>({});
  const [selectedMainIdRankOnChain, setSelectedMainIdRankOnChain] = useState<number | null>(null);

  useEffect(() => {
    const mId = Number(selectedMainId);
    if (!mId || mId <= 0) return;

    let isMounted = true;
    const fetchMainIdVaultsFromDB = async () => {
      try {
        // 1. Read directly from our backend Database API (/api/matrix/main-id/:mainId)
        const dbRes = await fetch(`/api/matrix/main-id/${mId}`, {
          headers: { Accept: 'application/json' },
        });
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          if (dbData?.success && dbData.vaultsByRank) {
            const resultMap: Record<number, number> = {};
            for (let r = 1; r <= 27; r++) {
              resultMap[r] = Number(dbData.vaultsByRank[r] ?? 0);
            }
            if (isMounted) {
              setMainIdVaultsOnChain(resultMap);
              setSelectedMainIdRankOnChain(Number(dbData.currentRank || 1));
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Notice fetching mainIdVaults from Database API:', err);
      }
    };

    fetchMainIdVaultsFromDB();
    const interval = setInterval(fetchMainIdVaultsFromDB, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedMainId, contractAddress, account, profile?.mainNodeIdRank1, profile?.currentMaxRank]);

  const vaultByRank = React.useMemo(() => {
    const map: Record<number, number> = {};
    const isPrimaryMain =
      !profile?.mainNodeIdRank1 || String(profile.mainNodeIdRank1) === String(selectedMainId);
    if (isPrimaryMain && Array.isArray(profile?.vaults)) {
      profile.vaults.forEach((v) => {
        map[v.rank] = parseFloat(v.balance || '0');
      });
    }
    // Override with reconciled per-Main-ID vaults (including 0 when deducted by rank upgrade)
    Object.entries(mainIdVaultsOnChain).forEach(([rStr, bal]) => {
      const r = Number(rStr);
      map[r] = bal;
    });
    return map;
  }, [profile?.vaults, profile?.mainNodeIdRank1, selectedMainId, mainIdVaultsOnChain]);

  const mainIdPools = React.useMemo(() => {
    const mIdNum = Number(selectedMainId) || 1;
    const isPrimaryMain =
      !profile?.mainNodeIdRank1 || String(profile.mainNodeIdRank1) === String(selectedMainId);
    const currentR = selectedMainIdRankOnChain ?? (isPrimaryMain ? (profile?.currentMaxRank || 1) : 1);
    return calculateMainIdVaultPools(mIdNum, currentR, vaultByRank);
  }, [selectedMainId, selectedMainIdRankOnChain, profile?.mainNodeIdRank1, profile?.currentMaxRank, vaultByRank]);

  const handleFullLogout = () => {
    setBypassGateToDashboard(false);
    disconnectWallet();
  };

  // Show Login Gate when no wallet is connected, or Onboarding Registration Form when wallet is not registered
  if (!bypassGateToDashboard) {
    if (!account) {
      return (
        <AuthAndOnboardingGate
          mode="login"
          language={language}
          onToggleLanguage={() => setLanguage(language === 'th' ? 'en' : 'th')}
          account={account}
          detectedBrowserWallet={detectedBrowserWallet}
          chainId={chainId}
          isBscTestnet={isBscTestnet}
          isConnecting={isConnecting}
          isLoadingProfile={isLoadingProfile}
          profile={profile}
          usdtBalance={usdtBalance}
          bnbBalance={bnbBalance}
          allowance={allowance}
          contractAddress={contractAddress || CONTRACT_ADDRESS}
          usdtAddress={usdtAddress || USDT_ADDRESS}
          txState={txState}
          onClearTxState={clearTxState}
          onConnectWallet={connectWallet}
          onLoginCustomInput={loginWithCustomInput}
          onLoginDemoUnregisteredWallet={loginWithDemoUnregisteredWallet}
          onDisconnect={handleFullLogout}
          onSwitchNetwork={switchToBscTestnet}
          onRefresh={refreshUserData}
          onEnterGuestDashboard={() => setBypassGateToDashboard(true)}
          onApproveUsdt={handleApproveUsdt}
          onRegister={handleRegister}
          onExecuteOffChainBatch={handleExecuteOffChainSimulationAndBatch}
          onCheckSponsor={checkSponsorNode}
          onPreviewPlacement={previewNextPlacement}
          onUpgradeToRank={handleUpgradeRank}
        />
      );
    }

    if (isLoadingProfile && !profile) {
      return (
        <AuthAndOnboardingGate
          mode="Checking"
          language={language}
          onToggleLanguage={() => setLanguage(language === 'th' ? 'en' : 'th')}
          account={account}
          detectedBrowserWallet={detectedBrowserWallet}
          chainId={chainId}
          isBscTestnet={isBscTestnet}
          isConnecting={isConnecting}
          isLoadingProfile={isLoadingProfile}
          profile={profile}
          usdtBalance={usdtBalance}
          bnbBalance={bnbBalance}
          allowance={allowance}
          contractAddress={contractAddress || CONTRACT_ADDRESS}
          usdtAddress={usdtAddress || USDT_ADDRESS}
          txState={txState}
          onClearTxState={clearTxState}
          onConnectWallet={connectWallet}
          onLoginCustomInput={loginWithCustomInput}
          onLoginDemoUnregisteredWallet={loginWithDemoUnregisteredWallet}
          onDisconnect={handleFullLogout}
          onSwitchNetwork={switchToBscTestnet}
          onRefresh={refreshUserData}
          onEnterGuestDashboard={() => setBypassGateToDashboard(true)}
          onApproveUsdt={handleApproveUsdt}
          onRegister={handleRegister}
          onExecuteOffChainBatch={handleExecuteOffChainSimulationAndBatch}
          onCheckSponsor={checkSponsorNode}
          onPreviewPlacement={previewNextPlacement}
          onUpgradeToRank={handleUpgradeRank}
        />
      );
    }

    if (!isLoadingProfile && !isWalletRegistered) {
      return (
        <AuthAndOnboardingGate
          mode="register_onboarding"
          language={language}
          onToggleLanguage={() => setLanguage(language === 'th' ? 'en' : 'th')}
          account={account}
          detectedBrowserWallet={detectedBrowserWallet}
          chainId={chainId}
          isBscTestnet={isBscTestnet}
          isConnecting={isConnecting}
          isLoadingProfile={isLoadingProfile}
          profile={profile}
          usdtBalance={usdtBalance}
          bnbBalance={bnbBalance}
          allowance={allowance}
          contractAddress={contractAddress || CONTRACT_ADDRESS}
          usdtAddress={usdtAddress || USDT_ADDRESS}
          txState={txState}
          onClearTxState={clearTxState}
          onConnectWallet={connectWallet}
          onLoginCustomInput={loginWithCustomInput}
          onLoginDemoUnregisteredWallet={loginWithDemoUnregisteredWallet}
          onDisconnect={handleFullLogout}
          onSwitchNetwork={switchToBscTestnet}
          onRefresh={refreshUserData}
          onEnterGuestDashboard={() => setBypassGateToDashboard(true)}
          onApproveUsdt={handleApproveUsdt}
          onRegister={handleRegister}
          onExecuteOffChainBatch={handleExecuteOffChainSimulationAndBatch}
          onCheckSponsor={checkSponsorNode}
          onPreviewPlacement={previewNextPlacement}
          onUpgradeToRank={handleUpgradeRank}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      <Header
        account={account}
        chainId={chainId}
        isBscTestnet={isBscTestnet}
        isConnecting={isConnecting}
        onConnect={connectWallet}
        onDisconnect={handleFullLogout}
        onSwitchNetwork={switchToBscTestnet}
        onRefresh={refreshUserData}
        language={language}
        onToggleLanguage={() => setLanguage(language === 'th' ? 'en' : 'th')}
        onOpenDeployModal={() => setIsDeployModalOpen(true)}
        contractAddress={contractAddress}
      />

      {/* Quick Banner when browsing in Guest / Bypass mode */}
      {(!account || !isWalletRegistered) && (
        <div className="bg-indigo-950/60 border-b border-indigo-500/30 px-3 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-indigo-200">
              {!account
                ? language === 'th'
                  ? 'โหมดดูข้อมูล (ยังไม่ได้เข้าสู่ระบบ)'
                  : 'Guest Preview Mode (Not logged in)'
                : language === 'th'
                ? 'กระเป๋านี้ยังไม่ได้ลงทะเบียนรหัสสมาชิก'
                : 'This wallet is not registered yet'}
            </span>
            <button
              onClick={() => setBypassGateToDashboard(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>
                {!account
                  ? language === 'th'
                    ? 'กลับไปหน้าเข้าสู่ระบบ / สมัครสมาชิก'
                    : 'Back to Login / Register'
                  : language === 'th'
                  ? 'เปิดฟอร์มสมัครสมาชิก'
                  : 'Open Registration Form'}
              </span>
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-8">
        {/* Global Transaction Status Toast / Banner */}
        {(txState.isLoading || txState.error || txState.successMessage) && (
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border flex items-start justify-between gap-3 shadow-lg ${
              txState.error
                ? 'bg-red-950/50 border-red-500/40 text-red-200'
                : txState.successMessage
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : 'bg-slate-900/90 border-indigo-500/40 text-indigo-200'
            }`}
          >
            <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
              {txState.isLoading && (
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0 mt-0.5" />
              )}
              {txState.error && (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              )}
              {txState.successMessage && !txState.isLoading && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              )}

              <div className="text-xs sm:text-sm space-y-1 min-w-0">
                <p className="font-semibold break-words">
                  {txState.error ||
                    txState.successMessage ||
                    (language === 'th'
                      ? 'กำลังดำเนินการธุรกรรมบนบล็อกเชน...'
                      : 'Processing blockchain transaction...')}
                </p>
                {txState.txHash && (
                  <a
                    href={`https://testnet.bscscan.com/tx/${txState.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs underline opacity-90 hover:opacity-100 font-mono"
                  >
                    <span>Tx: {txState.txHash.slice(0, 10)}...</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {!txState.isLoading && (
              <button
                onClick={clearTxState}
                className="p-1 rounded-lg hover:bg-white/10 transition shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* User Profile & Balances */}
        <UserProfileCard
          account={account}
          profile={profile}
          isLoading={isLoadingProfile}
          usdtBalance={usdtBalance}
          bnbBalance={bnbBalance}
          allowance={allowance}
          language={language}
          selectedInspectRank={selectedInspectRank}
          selectedVaultBalance={selectedVaultBalance}
          selectedMainId={selectedMainId}
          ownedMainIds={profile?.ownedMainIdsRank1 || []}
          onSelectMainId={setSelectedMainId}
          upgradeRankPool={mainIdPools.upgradeRankPool}
          newAutoIdPool={mainIdPools.newAutoIdPool}
          newExtraIdPool={mainIdPools.newExtraIdPool}
        />

        {/* Registration & Upgrade Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-start">
          <div className="lg:col-span-5">
            <RegisterSection
              account={account}
              isRegistered={profile?.isRegistered ?? false}
              mainNodeIdRank1={profile?.mainNodeIdRank1}
              usdtBalance={usdtBalance}
              allowance={allowance}
              onConnectWallet={connectWallet}
              onApproveUsdt={handleApproveUsdt}
              onRegister={handleRegister}
              onExecuteOffChainBatch={handleExecuteOffChainSimulationAndBatch}
              onCheckSponsor={checkSponsorNode}
              onPreviewPlacement={previewNextPlacement}
              isLoading={txState.isLoading}
              currentStep={txState.step}
              txError={txState.error}
              txSuccess={txState.successMessage}
              language={language}
            />
          </div>

          <div className="lg:col-span-7">
            <UpgradeRankSection
              account={account}
              currentRank={mainIdPools.currentRank}
              allowance={allowance}
              onUpgrade={handleUpgradeRank}
              onProcessAutoNewMainId={handleProcessAutoNewMainId}
              onProcessAutoExtraId={handleProcessAutoExtraId}
              isLoading={txState.isLoading}
              currentStep={txState.step}
              language={language}
              selectedMainId={selectedMainId}
              ownedMainIds={profile?.ownedMainIdsRank1 || []}
              onSelectMainId={setSelectedMainId}
              upgradeRankPool={mainIdPools.upgradeRankPool}
              newAutoIdPool={mainIdPools.newAutoIdPool}
              newExtraIdPool={mainIdPools.newExtraIdPool}
              window5Start={mainIdPools.window5Start}
              window5End={mainIdPools.window5End}
            />
          </div>
        </div>

        {/* Binary Matrix Tree Visualizer */}
        <MatrixTreeVisualizer
          language={language}
          userAddress={account}
          chainId={chainId}
          isBscTestnet={isBscTestnet}
          contractAddress={contractAddress}
          usdtBalance={usdtBalance}
          allowance={allowance}
          onConnectWallet={connectWallet}
          onSwitchNetwork={switchToBscTestnet}
          onApproveUsdt={handleApproveUsdt}
          onRegisterWithSponsor={handleRegister}
          onUpgradeToRank={handleUpgradeRank}
          currentUserRank={profile?.currentMaxRank || 1}
          lastTxSuccess={txState.successMessage}
          refreshTrigger={txState.successMessage}
        />

        {/* Rank Inspector & Admin Panel */}
        <RankInspectorAndAdminPanel
          account={account}
          language={language}
          selectedInspectRank={selectedInspectRank}
          onSelectInspectRank={setSelectedInspectRank}
          onInspectRank={inspectRankData}
          onRefreshOnChainData={refreshUserData}
          onAdminUpgrade={handleAdminUpgrade}
          onVaultBalanceChange={setSelectedVaultBalance}
          isLoading={txState.isLoading}
          contractAddress={contractAddress}
          usdtAddress={usdtAddress}
          onUpdateContractAddress={updateSmartContractAddress}
          onResetContractAddress={resetSmartContractAddress}
        />

        {/* On-Chain Event Logs */}
        <EventLogsSection language={language} account={account} />

        {/* Common Questions & Platform FAQ */}
        <FAQSection
          language={language}
          contractAddress={contractAddress || CONTRACT_ADDRESS}
          usdtAddress={usdtAddress || USDT_ADDRESS}
        />
      </main>

      <DeployContractModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        language={language}
        onUpdateContractAddress={updateSmartContractAddress}
      />
    </div>
  );
}
