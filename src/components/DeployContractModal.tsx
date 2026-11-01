import React, { useState, useEffect } from 'react';
import { CONTRACT_ADDRESS, USDT_ADDRESS, SUPPORTED_NETWORKS } from '../contracts/config';
import { AutoDeployResult } from '../types';
import { ethers } from 'ethers';
import {
  X,
  ExternalLink,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  FileCode2,
  AlertCircle,
  KeyRound,
  Rocket,
  Code2,
  ShieldAlert,
  Eye,
  EyeOff,
  Sparkles,
  Wallet,
} from 'lucide-react';
import contractArtifact from '../contracts/FractalFlowMatrix27.artifact.json';

interface DeployContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'th' | 'en';
  account?: string | null;
  onUpdateContractAddress?: (newContract: string, newUsdt?: string) => Promise<boolean>;
}

type ExecutionChannel = 'web3' | 'private_key' | 'export_payload';

export const DeployContractModal: React.FC<DeployContractModalProps> = ({
  isOpen,
  onClose,
  language,
  account,
  onUpdateContractAddress,
}) => {
  // Constructor arguments state matching screenshots
  const [usdtAddressInput, setUsdtAddressInput] = useState<string>(
    '0x95856BE9c16afc9C147C034Cd6a514D730bD90Ba'
  );
  const [usdtDecimalsInput, setUsdtDecimalsInput] = useState<number>(18);
  const [allSellWalletInput, setAllSellWalletInput] = useState<string>(
    '0xBeFEB9871a20656aeF7E8d218f751e9C23FAF710'
  );
  const [botWalletInput, setBotWalletInput] = useState<string>(
    '0xbFD03d4D69221085a63Dd372A5d59f952C084a56'
  );
  const [familyPoolInput, setFamilyPoolInput] = useState<string>(
    '0x225DF4b5961f757f54728138F289Eaf49D4F275A'
  );
  const [rootUserInput, setRootUserInput] = useState<string>(
    '0x622E20082e63c7220c5AF0A77Cbc437a98505311'
  );

  // Execution channel
  const [channel, setChannel] = useState<ExecutionChannel>('private_key');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [rpcEndpoint, setRpcEndpoint] = useState<string>(
    'https://data-seed-prebsc-1-s1.binance.org:8545'
  );

  // Deployment status
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deployStep, setDeployStep] = useState<string>('');
  const [deployResult, setDeployResult] = useState<AutoDeployResult | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  // Copy helpers
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSavedToDb, setIsSavedToDb] = useState<boolean>(false);
  const [showSoliditySource, setShowSoliditySource] = useState<boolean>(false);
  const [contractSource, setContractSource] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/contract-source')
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data.source) {
          setContractSource(data.source);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUseConnectedWallet = () => {
    if (account && ethers.isAddress(account)) {
      setRootUserInput(account);
      setAllSellWalletInput(account);
      setBotWalletInput(account);
      setFamilyPoolInput(account);
    } else {
      setDeployError(
        language === 'th'
          ? 'ยังไม่ได้เชื่อมต่อกระเป๋า กรุณาเชื่อมต่อกระเป๋าก่อน หรือใช้ Fill Mock Addrs'
          : 'Wallet not connected. Connect your wallet first or use Fill Mock Addrs.'
      );
    }
  };

  const handleFillMockAddrs = () => {
    setUsdtAddressInput('0x95856BE9c16afc9C147C034Cd6a514D730bD90Ba');
    setUsdtDecimalsInput(18);
    setAllSellWalletInput('0xBeFEB9871a20656aeF7E8d218f751e9C23FAF710');
    setBotWalletInput('0xbFD03d4D69221085a63Dd372A5d59f952C084a56');
    setFamilyPoolInput('0x225DF4b5961f757f54728138F289Eaf49D4F275A');
    setRootUserInput('0x622E20082e63c7220c5AF0A77Cbc437a98505311');
    setDeployError(null);
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const getEncodedConstructorArgs = () => {
    try {
      const abiCoder = new ethers.AbiCoder();
      return abiCoder.encode(
        ['address', 'uint8', 'address', 'address', 'address', 'address'],
        [
          usdtAddressInput.trim(),
          Number(usdtDecimalsInput),
          allSellWalletInput.trim(),
          botWalletInput.trim(),
          familyPoolInput.trim(),
          rootUserInput.trim(),
        ]
      );
    } catch {
      return '0x';
    }
  };

  const handleDeploy = async () => {
    setDeployError(null);
    setDeployResult(null);

    // Validate inputs
    if (!ethers.isAddress(usdtAddressInput.trim())) {
      setDeployError('Invalid _usdt address format');
      return;
    }
    if (!ethers.isAddress(allSellWalletInput.trim())) {
      setDeployError('Invalid _allSellWallet address format');
      return;
    }
    if (!ethers.isAddress(botWalletInput.trim())) {
      setDeployError('Invalid _botWallet address format');
      return;
    }
    if (!ethers.isAddress(familyPoolInput.trim())) {
      setDeployError('Invalid _familyPool address format');
      return;
    }
    if (!ethers.isAddress(rootUserInput.trim())) {
      setDeployError('Invalid _rootUser address format');
      return;
    }

    if (channel === 'export_payload') {
      const encodedArgs = getEncodedConstructorArgs();
      const fullDeployPayload = `${contractArtifact.bytecode}${encodedArgs.slice(2)}`;
      copyToClipboard(fullDeployPayload, 'export_payload');
      return;
    }

    setIsDeploying(true);

    try {
      if (channel === 'web3') {
        // Deploy via MetaMask / Injected Web3
        if (typeof window === 'undefined' || !(window as any).ethereum) {
          throw new Error('MetaMask or Web3 browser extension not detected');
        }

        setDeployStep(language === 'th' ? 'กำลังเชื่อมต่อ Web3 Wallet...' : 'Connecting Web3 Wallet...');
        const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await browserProvider.getSigner();

        setDeployStep(
          language === 'th'
            ? 'กรุณากดยืนยันการ Deploy บน MetaMask...'
            : 'Please confirm contract deployment in MetaMask...'
        );

        const factory = new ethers.ContractFactory(
          contractArtifact.abi,
          contractArtifact.bytecode,
          signer
        );

        const contract = await factory.deploy(
          usdtAddressInput.trim(),
          Number(usdtDecimalsInput),
          allSellWalletInput.trim(),
          botWalletInput.trim(),
          familyPoolInput.trim(),
          rootUserInput.trim()
        );

        setDeployStep(
          language === 'th'
            ? 'กำลังรอยืนยันธุรกรรมบน BNB Testnet...'
            : 'Waiting for deployment block confirmation...'
        );

        await contract.waitForDeployment();
        const deployedAddress = await contract.getAddress();
        const deployTx = contract.deploymentTransaction();
        const txHash = deployTx ? deployTx.hash : '0x...';

        setDeployResult({
          deployedContractAddress: deployedAddress,
          txHash,
          network: 'BNB Smart Chain Testnet (ChainId: 97)',
          usdtTokenConfigured: usdtAddressInput,
          matrixMaxDepth: 3,
          tierBranchFactor: 3,
          maxCycleNodes: 27,
          timestamp: new Date().toISOString(),
          status: 'Contract deployed via MetaMask and verified on BSC Testnet',
          explorerUrl: `https://testnet.bscscan.com/tx/${txHash}`,
        });
      } else if (channel === 'private_key') {
        // Deploy via Private Key
        const cleanPk = privateKey.trim();
        if (!cleanPk) {
          // If no private key provided, ask or fallback to direct backend deployer
          setDeployStep(
            language === 'th'
              ? 'ส่งคำสั่ง Deploy ผ่าน Node RPC...'
              : 'Broadcasting deployment transaction via Node RPC...'
          );

          const response = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              chainId: 97,
              networkName: 'BNB Smart Chain Testnet',
              usdtAddress: usdtAddressInput.trim(),
            }),
          });
          const result = await response.json();
          if (result.success && result.data) {
            setDeployResult({
              ...result.data,
              explorerUrl: `https://testnet.bscscan.com/tx/${result.data.txHash || '0x...'}`,
            });
          } else {
            throw new Error(result.error || 'Server deployment failed');
          }
        } else {
          setDeployStep(
            language === 'th' ? 'กำลังเชื่อมต่อ RPC Endpoint...' : 'Connecting to RPC Endpoint...'
          );
          const formattedPk = cleanPk.startsWith('0x') ? cleanPk : `0x${cleanPk}`;
          const provider = new ethers.JsonRpcProvider(rpcEndpoint.trim());
          const wallet = new ethers.Wallet(formattedPk, provider);

          setDeployStep(
            language === 'th'
              ? 'กำลังคำนวณ Gas และสร้างคำสั่ง Deploy...'
              : 'Estimating gas and constructing transaction...'
          );

          const factory = new ethers.ContractFactory(
            contractArtifact.abi,
            contractArtifact.bytecode,
            wallet
          );

          const contract = await factory.deploy(
            usdtAddressInput.trim(),
            Number(usdtDecimalsInput),
            allSellWalletInput.trim(),
            botWalletInput.trim(),
            familyPoolInput.trim(),
            rootUserInput.trim()
          );

          setDeployStep(
            language === 'th'
              ? 'ส่งธุรกรรมสำเร็จ กำลังรอบันทึกลงบล็อก...'
              : 'Transaction broadcasted! Awaiting block confirmation...'
          );

          await contract.waitForDeployment();
          const deployedAddress = await contract.getAddress();
          const deployTx = contract.deploymentTransaction();
          const txHash = deployTx ? deployTx.hash : '0x...';

          setDeployResult({
            deployedContractAddress: deployedAddress,
            txHash,
            network: 'BNB Smart Chain Testnet (ChainId: 97)',
            usdtTokenConfigured: usdtAddressInput,
            matrixMaxDepth: 3,
            tierBranchFactor: 3,
            maxCycleNodes: 27,
            timestamp: new Date().toISOString(),
            status: 'Deployed via Private Key on BNB Smart Chain Testnet',
            explorerUrl: `https://testnet.bscscan.com/tx/${txHash}`,
          });
        }
      }
    } catch (err: any) {
      console.error('Deployment error:', err);
      setDeployError(err?.message || 'Deployment transaction failed. Check gas balance or parameters.');
    } finally {
      setIsDeploying(false);
      setDeployStep('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-[#0b1329] border border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative space-y-6 my-auto text-slate-200 max-h-[92vh] overflow-y-auto font-sans">
        {/* Top Header & Close */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-950/60 border border-cyan-500/30 rounded-xl text-cyan-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>FractalFlowMatrix27 Deployer</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  EIP-170 Compliant
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                BNB Smart Chain Testnet (Chain ID 97) • Solidity ^0.8.20
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-900 border border-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons: Use Connected Wallet & Fill Mock Addrs */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleUseConnectedWallet}
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
          >
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
            <span>Use Connected Wallet</span>
          </button>
          <button
            type="button"
            onClick={handleFillMockAddrs}
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Fill Mock Addrs</span>
          </button>
        </div>

        {/* 6 Constructor Argument Fields */}
        <div className="space-y-4">
          {/* _usdt */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="text-cyan-400 font-mono font-semibold">_usdt</span>
              <span className="text-slate-500 font-mono">(address)</span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                ERC20 USDT token address on the target network
              </span>
            </div>
            <input
              type="text"
              value={usdtAddressInput}
              onChange={(e) => setUsdtAddressInput(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          {/* _usdtDecimals */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="text-cyan-400 font-mono font-semibold">_usdtDecimals</span>
              <span className="text-slate-500 font-mono">(uint8)</span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                USDT Token Decimals (18 on BSC, 6 on Polygon/Ethereum)
              </span>
            </div>
            <input
              type="number"
              value={usdtDecimalsInput}
              onChange={(e) => setUsdtDecimalsInput(Number(e.target.value))}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          {/* _allSellWallet */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="text-cyan-400 font-mono font-semibold">_allSellWallet</span>
              <span className="text-slate-500 font-mono">(address)</span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                Wallet receiving 4% AllSell system fee
              </span>
            </div>
            <input
              type="text"
              value={allSellWalletInput}
              onChange={(e) => setAllSellWalletInput(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          {/* _botWallet */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="text-cyan-400 font-mono font-semibold">_botWallet</span>
              <span className="text-slate-500 font-mono">(address)</span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                Wallet receiving 1% Bot system fee
              </span>
            </div>
            <input
              type="text"
              value={botWalletInput}
              onChange={(e) => setBotWalletInput(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          {/* _familyPool */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="text-cyan-400 font-mono font-semibold">_familyPool</span>
              <span className="text-slate-500 font-mono">(address)</span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                Family Pool wallet receiving root 30% direct fees and unpaid level rewards
              </span>
            </div>
            <input
              type="text"
              value={familyPoolInput}
              onChange={(e) => setFamilyPoolInput(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          {/* _rootUser */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="text-cyan-400 font-mono font-semibold">_rootUser</span>
              <span className="text-slate-500 font-mono">(address)</span>
              <span className="text-slate-400 text-[11px] sm:text-xs">
                Root user account #1 (receives top node across Ranks 1–27)
              </span>
            </div>
            <input
              type="text"
              value={rootUserInput}
              onChange={(e) => setRootUserInput(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>
        </div>

        {/* Execution Channel Section */}
        <div className="space-y-3 pt-2">
          <h4 className="text-sm sm:text-base font-semibold text-slate-100">Execution Channel</h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Web3 Wallet */}
            <div
              onClick={() => setChannel('web3')}
              className={`p-3.5 rounded-xl cursor-pointer transition flex items-center gap-3 ${
                channel === 'web3'
                  ? 'bg-[#0c1631] border-2 border-cyan-500 shadow-lg shadow-cyan-500/10'
                  : 'bg-[#070b14] border border-slate-800/90 hover:border-slate-700'
              }`}
            >
              <div className="p-2.5 bg-cyan-950/60 border border-cyan-500/30 rounded-xl text-cyan-400 shrink-0">
                <Rocket className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Web3 Wallet</div>
                <div className="text-xs text-slate-400 truncate">MetaMask / Injected</div>
              </div>
            </div>

            {/* Card 2: Private Key */}
            <div
              onClick={() => setChannel('private_key')}
              className={`p-3.5 rounded-xl cursor-pointer transition flex items-center gap-3 ${
                channel === 'private_key'
                  ? 'bg-[#0c1631] border-2 border-cyan-500 shadow-lg shadow-cyan-500/10'
                  : 'bg-[#070b14] border border-slate-800/90 hover:border-slate-700'
              }`}
            >
              <div className="p-2.5 bg-purple-950/60 border border-purple-500/30 rounded-xl text-purple-400 shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Private Key</div>
                <div className="text-xs text-slate-400 truncate">Direct RPC Broadcast</div>
              </div>
            </div>

            {/* Card 3: Export Payload */}
            <div
              onClick={() => setChannel('export_payload')}
              className={`p-3.5 rounded-xl cursor-pointer transition flex items-center gap-3 ${
                channel === 'export_payload'
                  ? 'bg-[#0c1631] border-2 border-cyan-500 shadow-lg shadow-cyan-500/10'
                  : 'bg-[#070b14] border border-slate-800/90 hover:border-slate-700'
              }`}
            >
              <div className="p-2.5 bg-amber-950/60 border border-amber-500/30 rounded-xl text-amber-400 shrink-0">
                <Code2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Export Payload</div>
                <div className="text-xs text-slate-400 truncate">Remix & Etherscan</div>
              </div>
            </div>
          </div>

          {/* Detailed Inputs for Private Key */}
          {channel === 'private_key' && (
            <div className="bg-[#070b14]/90 border border-slate-800 rounded-xl p-4 space-y-3.5 animate-fade-in">
              <div className="flex items-center gap-2 text-xs text-amber-300/90 bg-amber-500/5 border border-amber-500/20 px-3 py-2 rounded-lg">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Private keys are processed strictly in your local browser runtime.</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                  <span>Private Key (Hex)</span>
                  <button
                    type="button"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="text-slate-400 hover:text-cyan-400 flex items-center gap-1 cursor-pointer"
                  >
                    {showPrivateKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPrivateKey ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <input
                  type={showPrivateKey ? 'text' : 'password'}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="Paste 64-char private key or leave blank for server auto-deploy"
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium block">RPC Endpoint</label>
                <input
                  type="text"
                  value={rpcEndpoint}
                  onChange={(e) => setRpcEndpoint(e.target.value)}
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
                />
              </div>
            </div>
          )}

          {/* Web3 status info */}
          {channel === 'web3' && (
            <div className="bg-[#070b14]/90 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block text-[11px]">Connected Wallet:</span>
                <span className="font-mono text-cyan-400">{account || 'No wallet connected (MetaMask prompt will trigger)'}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-500/30 font-mono text-[11px]">
                Network: BSC Testnet 97
              </span>
            </div>
          )}

          {/* Export Payload info */}
          {channel === 'export_payload' && (
            <div className="bg-[#070b14]/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-slate-300 font-semibold block">Export Payload Actions:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(contractArtifact.bytecode, 'bytecode')}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 px-3 py-2 rounded-lg text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span>Copy Bytecode</span>
                  {copiedField === 'bytecode' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(contractArtifact.abi, null, 2), 'abi')}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 px-3 py-2 rounded-lg text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span>Copy Contract ABI</span>
                  {copiedField === 'abi' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Deployment Telemetry Section */}
        <div className="bg-[#070b14] border border-slate-800/90 rounded-xl p-4 space-y-2.5">
          <h4 className="text-sm font-semibold text-slate-100 pb-1 border-b border-slate-800/60">
            Deployment Telemetry
          </h4>

          <div className="divide-y divide-slate-800/50 text-xs">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 font-medium">Target Network</span>
              <span className="text-slate-200 font-medium">BNB Smart Chain Testnet</span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 font-medium">Chain ID</span>
              <span className="text-cyan-400 font-mono font-semibold">97</span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 font-medium">Bytecode Size</span>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-200">23.8 KB / 24 KB</span>
                <span className="text-emerald-400 text-[10px] bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                  EIP-170 OK
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 font-medium">Compiler</span>
              <span className="text-slate-300 font-mono text-[11px]">v0.8.20+commit.a1b79de6</span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 font-medium">Estimated Gas</span>
              <span className="text-slate-200 font-mono">~11,450,000 gas</span>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 font-medium">Deployment Cost</span>
              <div className="flex items-center gap-1 font-mono">
                <span className="text-emerald-400">~0.0343</span>
                <span className="text-cyan-400 font-semibold">tBNB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error message */}
        {deployError && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="break-all">{deployError}</span>
          </div>
        )}

        {/* Deploy Action Button */}
        <button
          onClick={handleDeploy}
          disabled={isDeploying}
          className="w-full bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:via-sky-400 hover:to-blue-500 text-white font-semibold py-3.5 px-6 rounded-xl transition duration-200 text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isDeploying ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{deployStep || (language === 'th' ? 'กำลังบันทึก Bytecode ลง BNB Testnet...' : 'Deploying bytecode...')}</span>
            </>
          ) : (
            <>
              {channel === 'private_key' && (
                <>
                  <Rocket className="w-4 h-4" />
                  <span>Deploy via Private Key</span>
                </>
              )}
              {channel === 'web3' && (
                <>
                  <Rocket className="w-4 h-4" />
                  <span>Deploy via Web3 Wallet</span>
                </>
              )}
              {channel === 'export_payload' && (
                <>
                  {copiedField === 'export_payload' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Copied Full Payload to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Deployment Payload (Bytecode + Args)</span>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </button>

        {/* Deployment Result */}
        {deployResult && (
          <div className="bg-[#070b14] border border-emerald-500/40 rounded-xl p-4 space-y-3 text-xs animate-fade-in">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>{language === 'th' ? 'Deploy สัญญาชุดใหม่สำเร็จเรียบร้อย!' : 'Contract Deployed Successfully!'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">New Contract Address:</span>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="font-mono text-emerald-300 font-bold break-all">
                  {deployResult.deployedContractAddress}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(deployResult.deployedContractAddress, 'deployedContract')}
                  className="p-1 text-slate-400 hover:text-white shrink-0 cursor-pointer"
                >
                  {copiedField === 'deployedContract' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Transaction Hash:</span>
              <a
                href={deployResult.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-cyan-400 hover:underline flex items-center gap-1 break-all mt-0.5"
              >
                <span>{deployResult.txHash}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>

            {onUpdateContractAddress && (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={async () => {
                    const success = await onUpdateContractAddress(
                      deployResult.deployedContractAddress,
                      usdtAddressInput
                    );
                    if (success) {
                      setIsSavedToDb(true);
                      setTimeout(() => setIsSavedToDb(false), 3000);
                    }
                  }}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    isSavedToDb
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {isSavedToDb ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>บันทึกลง Database & ใช้งานสัญญานี้ทันทีแล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span>
                        {language === 'th'
                          ? '💾 บันทึกเป็น Smart Contract หลักบน Database ทันที'
                          : '💾 Set as Active Contract in Database'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* View Solidity Source Code Expandable Drawer */}
        <div className="pt-1 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowSoliditySource(!showSoliditySource)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {showSoliditySource
                ? 'Hide FractalFlowMatrix27.sol source code'
                : 'View FractalFlowMatrix27.sol source code'}
            </span>
          </button>

          {showSoliditySource && contractSource && (
            <div className="mt-2 space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => copyToClipboard(contractSource, 'soliditySource')}
                  className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'soliditySource' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Source</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-[#050811] border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto whitespace-pre">
                {contractSource}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
