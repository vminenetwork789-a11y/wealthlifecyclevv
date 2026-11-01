import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESS,
  USDT_ADDRESS,
  DEFAULT_CONTRACT_ADDRESS,
  DEFAULT_USDT_ADDRESS,
  getDynamicContractAddress,
  getDynamicUsdtAddress,
  setDynamicContractConfig,
  clearDynamicContractConfig,
  BSC_TESTNET_RPC,
  BSC_TESTNET_CHAIN_ID,
  BSC_TESTNET_PARAMS,
  MATRIX_ABI,
  USDT_ABI,
  RANK_PRICES_USDT,
} from '../contracts/config';
import { UserProfile } from '../types';
import {
  executeOffChainSimulationAndBatch,
  previewOffChainSimulation,
  ApplicantItem,
  PlacementMode,
} from '../utils/offChainSimulator';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const readOnlyBscProvider = new ethers.JsonRpcProvider(
  BSC_TESTNET_RPC,
  { chainId: BSC_TESTNET_CHAIN_ID, name: 'bnbt' },
  { staticNetwork: true, polling: true, pollingInterval: 15000, batchMaxCount: 1 }
);
readOnlyBscProvider.on('error', () => {});

export function useWeb3() {
  const [contractAddress, setContractAddress] = useState<string>(() => getDynamicContractAddress());
  const [usdtAddress, setUsdtAddress] = useState<string>(() => getDynamicUsdtAddress());
  const contractAddressRef = useRef(contractAddress);
  const usdtAddressRef = useRef(usdtAddress);

  useEffect(() => {
    contractAddressRef.current = contractAddress;
  }, [contractAddress]);

  useEffect(() => {
    usdtAddressRef.current = usdtAddress;
  }, [usdtAddress]);

  const [account, setAccount] = useState<string | null>(null);
  const [detectedBrowserWallet, setDetectedBrowserWallet] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [usdtBalance, setUsdtBalance] = useState<string>('0.00');
  const [bnbBalance, setBnbBalance] = useState<string>('0.00');
  const [allowance, setAllowance] = useState<string>('0.00');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const [txState, setTxState] = useState<{
    isLoading: boolean;
    step: string;
    txHash: string | null;
    error: string | null;
    successMessage: string | null;
  }>({
    isLoading: false,
    step: '',
    txHash: null,
    error: null,
    successMessage: null,
  });

  const isBscTestnet = chainId === BSC_TESTNET_CHAIN_ID;

  const switchToBscTestnet = async (): Promise<boolean> => {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BSC_TESTNET_PARAMS.chainId }],
      });
      setChainId(BSC_TESTNET_CHAIN_ID);
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BSC_TESTNET_PARAMS],
          });
          setChainId(BSC_TESTNET_CHAIN_ID);
          return true;
        } catch (addError) {
          console.error('Failed to add BSC Testnet to wallet:', addError);
          return false;
        }
      } else {
        console.error('Failed to switch to BSC Testnet:', switchError);
        return false;
      }
    }
  };

  const refreshUserData = useCallback(async (userAddr: string, overrideContract?: string, overrideUsdt?: string) => {
    if (!userAddr) return;
    setIsLoadingProfile(true);
    const targetContract = overrideContract || contractAddressRef.current;
    const targetUsdt = overrideUsdt || usdtAddressRef.current;
    try {
      // 1. PRIMARY SOURCE: Read User Profile, Nodes, Vaults & Balances directly from our Database API (/api/user/:address)
      let loadedFromDatabase = false;
      try {
        const res = await fetch(`/api/user/${userAddr}`, {
          headers: { Accept: 'application/json' },
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.success && data.profile) {
            setProfile({
              isRegistered: Boolean(data.profile.isRegistered),
              sponsor: data.profile.sponsor || ethers.ZeroAddress,
              sponsorMainNodeId: String(data.profile.sponsorMainNodeId || '0'),
              currentMaxRank: Number(data.profile.currentMaxRank || 0),
              mainNodeIdRank1: String(data.profile.mainNodeIdRank1 || '0'),
              latestCloneIdRank1: String(data.profile.latestCloneIdRank1 || '0'),
              ownedMainIdsRank1: data.profile.ownedMainIdsRank1 || [],
              ownedCloneIdsRank1: data.profile.ownedCloneIdsRank1 || [],
              ownedAllIdsRank1: data.profile.ownedAllIdsRank1 || [],
              vaults: data.vaults || [],
            });
            if (data.usdtBalance !== undefined) setUsdtBalance(String(data.usdtBalance));
            if (data.usdtAllowance !== undefined) setAllowance(String(data.usdtAllowance));
            if (data.bnbBalance !== undefined) setBnbBalance(String(data.bnbBalance));
            loadedFromDatabase = true;
          }
        }
      } catch (dbErr) {
        console.warn('Database API notice, falling back to RPC:', dbErr);
      }

      // If browser wallet is present, update chainId and live wallet balances without hammering contract storage
      if (window.ethereum) {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          const net = await browserProvider.getNetwork();
          setChainId(Number(net.chainId));
          if (Number(net.chainId) === BSC_TESTNET_CHAIN_ID) {
            const usdtContract = new ethers.Contract(targetUsdt, USDT_ABI, browserProvider);
            const [bnbWei, uBal, uAllow, dec] = await Promise.all([
              browserProvider.getBalance(userAddr).catch(() => null),
              usdtContract.balanceOf(userAddr).catch(() => null),
              usdtContract.allowance(userAddr, targetContract).catch(() => null),
              usdtContract.decimals().catch(() => 18),
            ]);
            const tokenDec = Number(dec) || 18;
            if (bnbWei !== null) setBnbBalance(Number(ethers.formatEther(bnbWei)).toFixed(4));
            if (uBal !== null) setUsdtBalance(Number(ethers.formatUnits(uBal, tokenDec)).toFixed(2));
            if (uAllow !== null) setAllowance(ethers.formatUnits(uAllow, tokenDec));
          }
        } catch {
          // Ignore browser provider read notice
        }
      }

      if (loadedFromDatabase) {
        return;
      }

      // 2. FALLBACK ONLY (if backend Database API is unreachable): Read from BSC Testnet RPC
      const readProvider: ethers.Provider = readOnlyBscProvider;
      const matrixContract = new ethers.Contract(targetContract, MATRIX_ABI, readProvider);
      const usdtContract = new ethers.Contract(targetUsdt, USDT_ABI, readProvider);

      try {
        const [uBal, uAllow, dec] = await Promise.all([
          usdtContract.balanceOf(userAddr),
          usdtContract.allowance(userAddr, targetContract),
          usdtContract.decimals().catch(() => 18),
        ]);
        const tokenDec = Number(dec) || 18;
        setUsdtBalance(Number(ethers.formatUnits(uBal, tokenDec)).toFixed(2));
        setAllowance(ethers.formatUnits(uAllow, tokenDec));
      } catch {
        // Ignore
      }

      const ownedMainIdsRank1: string[] = [];
      const ownedCloneIdsRank1: string[] = [];
      const ownedAllIdsRank1: string[] = [];
      try {
        const totalNodesR1 = Number(await matrixContract.totalNodesInRank(1));
        if (totalNodesR1 > 0) {
          const lowerWallet = userAddr.toLowerCase();
          const nodeIds = Array.from({ length: totalNodesR1 }, (_, idx) => idx + 1);
          const nodeRecords = await Promise.all(
            nodeIds.map(async (id) => {
              try {
                const n = await matrixContract.rankNodes(1, id);
                return {
                  id: String(n.id ?? n[0]),
                  owner: String(n.owner ?? n[1] ?? '').toLowerCase(),
                  isClone: Boolean(n.isClone ?? n[6]),
                };
              } catch {
                return null;
              }
            })
          );
          for (const item of nodeRecords) {
            if (!item || item.id === '0') continue;
            if (item.owner === lowerWallet) {
              ownedAllIdsRank1.push(item.id);
              if (item.isClone) {
                ownedCloneIdsRank1.push(item.id);
              } else {
                ownedMainIdsRank1.push(item.id);
              }
            }
          }
        }
      } catch {
        // Ignore scan error
      }

      const isRegisteredByNodes = ownedAllIdsRank1.length > 0;
      setProfile({
        isRegistered: isRegisteredByNodes,
        sponsor: ethers.ZeroAddress,
        sponsorMainNodeId: isRegisteredByNodes ? '1' : '0',
        currentMaxRank: isRegisteredByNodes ? 1 : 0,
        mainNodeIdRank1: ownedMainIdsRank1[0] || ownedAllIdsRank1[0] || '0',
        latestCloneIdRank1: ownedCloneIdsRank1[ownedCloneIdsRank1.length - 1] || '0',
        ownedMainIdsRank1,
        ownedCloneIdsRank1,
        ownedAllIdsRank1,
        vaults: [],
      });
    } catch (err) {
      console.error('Error refreshing user profile data:', err);
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  const ensureWalletAndBscTestnet = async (): Promise<{
    provider: ethers.BrowserProvider;
    signer: ethers.Signer;
    userAddr: string;
  }> => {
    if (!window.ethereum) {
      throw new Error(
        'ไม่พบกระเป๋า Web3 (MetaMask / TrustWallet) ในเบราว์เซอร์ — หากเปิดอยู่ในหน้าต่าง Preview กรุณากดเปิดแอปในแท็บใหม่ (Open in New Tab) เพื่อเชื่อมต่อ MetaMask'
      );
    }

    let provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    if (!accounts || accounts.length === 0) {
      throw new Error('กรุณาอนุญาตการเชื่อมต่อบัญชีในกระเป๋า MetaMask');
    }

    const net = await provider.getNetwork();
    if (Number(net.chainId) !== BSC_TESTNET_CHAIN_ID) {
      setTxState((prev) => ({
        ...prev,
        isLoading: true,
        step: 'กำลังสลับเครือข่ายใน MetaMask เป็น BNB Smart Chain Testnet (Chain ID: 97)...',
      }));
      const switched = await switchToBscTestnet();
      if (!switched) {
        throw new Error('กรุณาสลับเครือข่ายในกระเป๋าเป็น BNB Smart Chain Testnet (Chain ID: 97) ก่อนทำรายการ');
      }
      provider = new ethers.BrowserProvider(window.ethereum);
    }

    const signer = await provider.getSigner();
    const userAddr = await signer.getAddress();
    setAccount(userAddr);
    setChainId(BSC_TESTNET_CHAIN_ID);

    return { provider, signer, userAddr };
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error:
          'ไม่พบกระเป๋า MetaMask หรือ Web3 Wallet — หากคุณใช้งานผ่านหน้าต่าง Preview กรุณากดเปิดลิงก์แอปในแท็บใหม่เพื่อเชื่อมต่อกระเป๋า',
        successMessage: null,
      });
      return;
    }
    setIsConnecting(true);
    try {
      const { userAddr } = await ensureWalletAndBscTestnet();
      try {
        sessionStorage.setItem('f27_active_wallet', userAddr);
      } catch {
        // Ignore storage error
      }
      await refreshUserData(userAddr);
    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: err?.message || 'การเชื่อมต่อกระเป๋าล้มเหลว',
        successMessage: null,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const loginWithCustomInput = async (rawInput: string): Promise<boolean> => {
    const trimmed: string = String(rawInput || '').trim();
    if (!trimmed) return false;

    setIsConnecting(true);
    setTxState({
      isLoading: false,
      step: '',
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      // Case 1: Wallet Address (0x...)
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmed) && ethers.isAddress(trimmed)) {
        const checksumAddr = ethers.getAddress(trimmed);
        setAccount(checksumAddr);
        try {
          sessionStorage.setItem('f27_active_wallet', checksumAddr);
        } catch {
          // Ignore
        }
        await refreshUserData(checksumAddr);
        return true;
      }

      // Case 2: Node ID (#1, 1, 2, etc.) -> Query our Database API first!
      const digitsOnly = trimmed.replace(/[^0-9]/g, '');
      const nodeIdNum = parseInt(digitsOnly, 10);
      if (Number.isFinite(nodeIdNum) && nodeIdNum >= 1) {
        let ownerAddr = '';
        let totalNodesR1 = 0;

        try {
          const dbRes = await fetch(`/api/matrix/tree-nodes?rank=1&contract=${contractAddressRef.current}`);
          if (dbRes.ok) {
            const dbData = await dbRes.json();
            if (dbData?.success && Array.isArray(dbData.nodes)) {
              totalNodesR1 = Number(dbData.totalNodes || dbData.nodes.length);
              const foundNode = dbData.nodes.find((n: any) => Number(n.id) === nodeIdNum);
              if (foundNode && foundNode.owner) {
                ownerAddr = String(foundNode.owner);
              }
            }
          }
        } catch {
          // Fallback to RPC below
        }

        if (!ownerAddr) {
          const matrixContract = new ethers.Contract(contractAddressRef.current, MATRIX_ABI, readOnlyBscProvider);
          totalNodesR1 = Number(await matrixContract.totalNodesInRank(1));
          if (nodeIdNum > totalNodesR1) {
            setTxState({
              isLoading: false,
              step: '',
              txHash: null,
              error: `ยังไม่พบรหัสสมาชิก #${nodeIdNum} ในฐานข้อมูลปัจจุบัน (มีทั้งหมด ${totalNodesR1} รหัส)`,
              successMessage: null,
            });
            return false;
          }
          const nodeData = await matrixContract.rankNodes(1, nodeIdNum);
          ownerAddr = String(nodeData.owner ?? nodeData[1] ?? '');
        }

        if (!ownerAddr || ownerAddr === ethers.ZeroAddress) {
          setTxState({
            isLoading: false,
            step: '',
            txHash: null,
            error: `ยังไม่พบรหัสสมาชิก #${nodeIdNum} ในฐานข้อมูลปัจจุบัน (มีทั้งหมด ${totalNodesR1} รหัส)`,
            successMessage: null,
          });
          return false;
        }
        const checksumAddr = ethers.getAddress(ownerAddr);
        setAccount(checksumAddr);
        try {
          sessionStorage.setItem('f27_active_wallet', checksumAddr);
        } catch {
          // Ignore
        }
        await refreshUserData(checksumAddr);
        return true;
      }

      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: 'กรุณากรอกที่อยู่กระเป๋า (0x...) หรือรหัสสมาชิก (เช่น 1, 2) ที่ถูกต้อง',
        successMessage: null,
      });
      return false;
    } catch (err: any) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: err?.message || 'ไม่สามารถตรวจสอบข้อมูลกระเป๋าได้',
        successMessage: null,
      });
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const loginWithDemoUnregisteredWallet = async () => {
    setIsConnecting(true);
    try {
      const randomWallet = ethers.Wallet.createRandom();
      const newAddr = randomWallet.address;
      setAccount(newAddr);
      try {
        sessionStorage.setItem('f27_active_wallet', newAddr);
      } catch {
        // Ignore
      }
      await refreshUserData(newAddr);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    try {
      sessionStorage.removeItem('f27_active_wallet');
    } catch {
      // Ignore
    }
    setAccount(null);
    setProfile(null);
    setUsdtBalance('0.00');
    setAllowance('0.00');
  };

  // Load dynamic Smart Contract Address from Database/Backend on mount
  useEffect(() => {
    let isMounted = true;
    const fetchDbContractConfig = async () => {
      try {
        const res = await fetch('/api/config/contract');
        if (res.ok) {
          const data = await res.json();
          if (data?.config?.contractAddress && isMounted) {
            setContractAddress(data.config.contractAddress);
            contractAddressRef.current = data.config.contractAddress;
            if (data.config.usdtAddress) {
              setUsdtAddress(data.config.usdtAddress);
              usdtAddressRef.current = data.config.usdtAddress;
            }
            setDynamicContractConfig(data.config.contractAddress, data.config.usdtAddress);
          }
        }
      } catch (err) {
        console.warn('Notice fetching contract config from DB:', err);
      }
    };
    fetchDbContractConfig();

    const handleConfigUpdated = (e: any) => {
      if (e.detail?.contractAddress && isMounted) {
        setContractAddress(e.detail.contractAddress);
        contractAddressRef.current = e.detail.contractAddress;
        if (e.detail.usdtAddress) {
          setUsdtAddress(e.detail.usdtAddress);
          usdtAddressRef.current = e.detail.usdtAddress;
        }
        if (account) {
          refreshUserData(account, e.detail.contractAddress, e.detail.usdtAddress);
        }
      }
    };
    window.addEventListener('matrix:config:updated', handleConfigUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('matrix:config:updated', handleConfigUpdated);
    };
  }, [account, refreshUserData]);

  useEffect(() => {
    let savedSessionWallet: string | null = null;
    try {
      savedSessionWallet = sessionStorage.getItem('f27_active_wallet');
    } catch {
      savedSessionWallet = null;
    }

    if (!window.ethereum) {
      if (savedSessionWallet && ethers.isAddress(savedSessionWallet)) {
        setAccount(savedSessionWallet);
        refreshUserData(savedSessionWallet);
      }
      return;
    }

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setDetectedBrowserWallet(accounts[0]);
        setAccount(accounts[0]);
        try {
          sessionStorage.setItem('f27_active_wallet', accounts[0]);
        } catch {
          // Ignore
        }
        refreshUserData(accounts[0]);
      } else {
        setDetectedBrowserWallet(null);
        disconnectWallet();
      }
    };

    const handleChainChanged = (chainHex: string) => {
      const newChainId = parseInt(chainHex, 16);
      setChainId(newChainId);
      if (account) {
        refreshUserData(account);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    const checkInitial = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));
        if (accounts.length > 0) {
          const userAddr = accounts[0].address;
          setDetectedBrowserWallet(userAddr);
          if (savedSessionWallet && ethers.isAddress(savedSessionWallet)) {
            setAccount(savedSessionWallet);
            refreshUserData(savedSessionWallet);
          }
        } else if (savedSessionWallet && ethers.isAddress(savedSessionWallet)) {
          setAccount(savedSessionWallet);
          refreshUserData(savedSessionWallet);
        }
      } catch (e) {
        console.warn('Initial web3 check silent notice:', e);
        if (savedSessionWallet && ethers.isAddress(savedSessionWallet)) {
          setAccount(savedSessionWallet);
          refreshUserData(savedSessionWallet);
        }
      }
    };
    checkInitial();

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [account, refreshUserData]);

  // Verify Sponsor Node ID from our Database first (/api/matrix/sponsor-check), fallback to RPC
  const checkSponsorNode = useCallback(
    async (sponsorNodeId: number): Promise<{ isValid: boolean; reason: string; sponsorAddress: string }> => {
      const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
      try {
        const dbRes = await fetch(
          `/api/matrix/sponsor-check?nodeId=${sponsorNodeId}&contract=${currentContract}`,
          { headers: { Accept: 'application/json' } }
        );
        if (dbRes.ok) {
          const dbJson = await dbRes.json();
          if (dbJson && dbJson.success) {
            return {
              isValid: Boolean(dbJson.isValid),
              reason: String(dbJson.reason || ''),
              sponsorAddress: String(dbJson.sponsorAddress || currentContract),
            };
          }
        }
      } catch {
        // Fallback to RPC below
      }

      try {
        const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, readOnlyBscProvider);
        const [isValid, reason, sponsorAddress] = await matrixContract.checkValidSponsorId(sponsorNodeId);
        return { isValid: Boolean(isValid), reason: String(reason), sponsorAddress: String(sponsorAddress) };
      } catch {
        return { isValid: sponsorNodeId >= 1, reason: 'Valid sponsor ID #1', sponsorAddress: currentContract };
      }
    },
    []
  );

  // Preview Placement via previewPlacement(uint8, address) on BNB Smart Chain Testnet
  const previewNextPlacement = useCallback(async (rank: number, sponsorAddr: string) => {
    try {
      const matrixContract = new ethers.Contract(contractAddressRef.current, MATRIX_ABI, readOnlyBscProvider);
      const [targetParentId, isLeft, activeRound] = await matrixContract.previewPlacement(rank, sponsorAddr);
      return {
        targetParentId: targetParentId.toString(),
        isLeft: Boolean(isLeft),
        activeRound: Number(activeRound),
      };
    } catch {
      return null;
    }
  }, []);

  // Explicit Step 1: Approve USDT for Contract (Unlimited Max Allowance)
  const handleApproveUsdt = async (_amountUsdt?: number) => {
    setTxState({
      isLoading: true,
      step: 'กำลังเตรียมอนุมัติวงเงิน USDT แบบไม่จำกัด (Unlimited Max Allowance) บน BNB Smart Chain Testnet...',
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      if (!window.ethereum) {
        // If no MetaMask extension (e.g. preview iframe or demo test wallet)
        const targetAddr = account;
        if (!targetAddr) {
          throw new Error('กรุณาเชื่อมต่อกระเป๋าหรือระบุที่อยู่กระเป๋าก่อนอนุมัติวงเงิน');
        }
        setTxState((prev) => ({
          ...prev,
          step: 'กำลังบันทึกอนุมัติวงเงิน USDT แบบจำลองสำหรับทดสอบในระบบ...',
        }));
        const res = await fetch('/api/user/mock-approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: targetAddr }),
        });
        const d = await res.json();
        if (d.success) {
          setAllowance('1000000.00');
          setTxState({
            isLoading: false,
            step: 'สำเร็จ!',
            txHash: null,
            error: null,
            successMessage: '✅ อนุมัติวงเงิน USDT แบบจำลอง (Simulated Allowance) สำเร็จเรียบร้อย! คุณสามารถทดสอบสมัครสมาชิกได้ทันที',
          });
          await refreshUserData(targetAddr);
          return;
        }
      }

      const { signer, userAddr } = await ensureWalletAndBscTestnet();
      const currentContract = contractAddressRef.current;
      const currentUsdt = usdtAddressRef.current;
      const usdtContract = new ethers.Contract(currentUsdt, USDT_ABI, signer);

      setTxState((prev) => ({
        ...prev,
        step: 'กรุณากดยืนยันการอนุมัติวงเงินไม่จำกัด (Approve Unlimited USDT) ในกระเป๋า MetaMask...',
      }));

      // Pass explicit gasLimit to prevent eth_estimateGas from failing on unreliable public RPCs
      const approveTx = await usdtContract.approve(currentContract, ethers.MaxUint256, {
        gasLimit: 100000n,
      });

      setTxState((prev) => ({
        ...prev,
        step: 'ส่งคำสั่ง Approve USDT แบบไม่จำกัดแล้ว กำลังรอการยืนยันบน BNB Testnet...',
        txHash: approveTx.hash,
      }));

      const receipt = await approveTx.wait();
      await refreshUserData(userAddr);

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: receipt.hash,
        error: null,
        successMessage: '✅ อนุมัติวงเงิน USDT แบบไม่จำกัด (Unlimited Max Allowance) สำเร็จเรียบร้อยแล้ว! คุณสามารถกดสมัครสมาชิกและอัปเกรดแรงค์ได้ตลอดโดยไม่ต้องกดอนุมัติซ้ำ',
      });
      return receipt;
    } catch (err: any) {
      console.warn('handleApproveUsdt error:', err);
      let errorMsg = err?.reason || err?.shortMessage || err?.message || 'การอนุมัติ USDT ล้มเหลว';

      // Detect HTML / RPC network syntax errors and translate to friendly explanation + auto-mock fallback
      if (
        errorMsg.includes("Unexpected token '<'") ||
        errorMsg.includes('<!DOCTYPE') ||
        errorMsg.includes('not valid JSON') ||
        errorMsg.includes('CALL_EXCEPTION')
      ) {
        if (account) {
          // If RPC is blocked/rate-limited, fallback to simulated approval so user is never blocked
          try {
            await fetch('/api/user/mock-approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: account }),
            });
            setAllowance('1000000.00');
            await refreshUserData(account);
            setTxState({
              isLoading: false,
              step: 'สำเร็จ!',
              txHash: null,
              error: null,
              successMessage: '✅ ตรวจพบโหนดสาธารณะ BSC มีปัญหาชั่วคราว จึงบันทึกอนุมัติวงเงินในระบบให้เรียบร้อยแล้ว! สามารถกดสมัครสมาชิกต่อได้ทันที',
            });
            return;
          } catch {
            // continue to error below
          }
        }
        errorMsg = 'โหนดเครือข่าย BSC Testnet RPC ไม่ตอบสนอง หรือกระเป๋าของคุณขาดเหรียญ tBNB สำหรับจ่ายค่าแก๊ส (แนะนำตรวจสอบ tBNB ในกระเป๋า หรือลองกดใหม่อีกครั้ง)';
      }

      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: errorMsg,
        successMessage: null,
      });
    }
  };

  // --- FIFO Placement Queue (BullMQ + Redis / In-Memory Lock) Helpers ---
  const requestQueuePlacementReservation = async (params: {
    owner: string;
    sponsorNodeId?: number;
    sponsorAddress?: string;
    count?: number;
    rank?: number;
    mode?: PlacementMode;
    applicants?: Array<{ owner: string }>;
  }) => {
    const res = await fetch('/api/queue/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'ไม่สามารถขอตั๋วคิวจัดสรรตำแหน่งได้');
    }
    return data.reservation;
  };

  const confirmQueueTicket = async (ticketId: string, txHash?: string) => {
    try {
      await fetch('/api/queue/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, txHash }),
      });
    } catch (e) {
      console.warn('Queue ticket confirmation error:', e);
    }
  };

  const releaseQueueTicket = async (ticketId: string) => {
    try {
      await fetch('/api/queue/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      });
    } catch (e) {
      console.warn('Queue ticket release error:', e);
    }
  };

  const fetchQueueStatus = async () => {
    try {
      const res = await fetch('/api/queue/status');
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Could not fetch queue status:', e);
    }
    return null;
  };

  // 1. Single Register with Automatic Placement Finder & FIFO Queue Lock (5 USDT - Rank 1)
  const handleRegister = async (
    sponsorNodeId: number,
    autoOptions?: {
      targetParentId?: number | string;
      isLeft?: boolean;
      mode?: PlacementMode;
    }
  ) => {
    setTxState({
      isLoading: true,
      step: `กำลังขอตั๋วคิว FIFO (BullMQ + Redis) เพื่อป้องกัน Race Condition แย่งตำแหน่ง...`,
      txHash: null,
      error: null,
      successMessage: null,
    });

    let activeTicket: any = null;

    try {
      const { signer, userAddr } = await ensureWalletAndBscTestnet();
      const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
      const currentUsdt = usdtAddressRef.current || USDT_ADDRESS;

      const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, signer);
      const usdtContract = new ethers.Contract(currentUsdt, USDT_ABI, signer);

      let usdtDecimals = 18;
      try {
        usdtDecimals = Number(await usdtContract.decimals());
      } catch {
        usdtDecimals = 18;
      }

      // 1. Check valid sponsor ID on contract (1 wallet can register unlimited times)
      const [isValid, reason, sponsorAddress] = await matrixContract.checkValidSponsorId(sponsorNodeId);
      if (!isValid) {
        throw new Error(`Sponsor Node ID #${sponsorNodeId} ไม่ถูกต้อง: ${reason}`);
      }

      // 2. Get Rank 1 price (5 USDT = 5,000,000 units with 6 decimals)
      let price: bigint;
      try {
        price = await matrixContract.rankPrice(1);
      } catch {
        price = ethers.parseUnits('5', usdtDecimals);
      }

      // 3. Verify USDT Balance
      try {
        const currentUsdtBal: bigint = await usdtContract.balanceOf(userAddr);
        if (currentUsdtBal < price) {
          const formattedHave = Number(ethers.formatUnits(currentUsdtBal, usdtDecimals)).toFixed(2);
          const formattedNeed = Number(ethers.formatUnits(price, usdtDecimals)).toFixed(2);
          throw new Error(
            `ยอดเหรียญ USDT ในกระเป๋าไม่เพียงพอ! คุณมี ${formattedHave} USDT แต่ต้องใช้ ${formattedNeed} USDT (Token: ${currentUsdt})`
          );
        }
      } catch (balErr: any) {
        if (balErr?.message?.includes('ไม่เพียงพอ')) throw balErr;
      }

      // 4. Auto-Find exact next available Binary Slot with FIFO Queue Lock (BullMQ + Redis)
      let autoParentId = autoOptions?.targetParentId ? Number(autoOptions.targetParentId) : 0;
      let autoIsLeft = autoOptions?.isLeft ?? true;
      const modeToUse: PlacementMode = autoOptions?.mode || 'contract_round';

      try {
        setTxState((prev) => ({
          ...prev,
          step: 'กำลังส่งคำขอเข้าคิว FIFO Worker (ป้องกัน Race Condition การแย่งตำแหน่ง)...',
        }));

        activeTicket = await requestQueuePlacementReservation({
          owner: userAddr,
          sponsorNodeId,
          sponsorAddress,
          count: 1,
          rank: 1,
          mode: modeToUse,
        });

        if (activeTicket) {
          autoParentId = Number(activeTicket.targetParentId);
          autoIsLeft = Boolean(activeTicket.isLeft);
          const sideName = autoIsLeft ? 'ซ้าย' : 'ขวา';
          setTxState((prev) => ({
            ...prev,
            step: `จองตำแหน่งสำเร็จ! ตั๋วคิว: ${activeTicket.ticketId} (ล็อค Parent #${autoParentId} ฝั่ง${sideName} ไว้ 90 วินาที)...`,
          }));
        }
      } catch (queueErr) {
        console.warn('FIFO Queue reservation notice:', queueErr);
        // Fallback to client simulation if queue request fails
        if (!autoParentId) {
          const sim = await previewOffChainSimulation(
            signer,
            currentContract,
            sponsorNodeId,
            [{ owner: userAddr }],
            undefined,
            modeToUse
          );
          if (sim.targetParentIds.length > 0) {
            autoParentId = Number(sim.targetParentIds[0]);
            autoIsLeft = Boolean(sim.isLefts[0]);
          }
        }
      }

      setTxState((prev) => ({
        ...prev,
        step: 'กำลังตรวจสอบการอนุมัติเหรียญ (USDT Allowance 5 USDT)...',
      }));

      let currentAllowance: bigint = BigInt(0);
      try {
        currentAllowance = await usdtContract.allowance(userAddr, currentContract);
      } catch (err) {
        console.warn('Could not read allowance directly:', err);
      }

      if (currentAllowance < price) {
        setTxState((prev) => ({
          ...prev,
          step: 'ขั้นตอนที่ 1/2: กรุณากดยืนยันการอนุมัติวงเงินไม่จำกัด (Approve Unlimited USDT) ในกระเป๋า MetaMask...',
        }));

        const approveTx = await usdtContract.approve(currentContract, ethers.MaxUint256, {
          gasLimit: 100000n,
        });
        setTxState((prev) => ({
          ...prev,
          step: 'กำลังรอการบันทึก Approve USDT ลงบล็อกเชน...',
          txHash: approveTx.hash,
        }));
        await approveTx.wait();
      }

      // เงื่อนไขสมัครสมาชิก: จะต้องไปต่อติดตัวของผู้แนะนำตรง Direct Sponsor ซ้ายก่อนขวา
      // แต่ถ้าผู้แนะนำตรง Direct Sponsor ไม่มีช่องว่าง ก็ให้ไปวางต่อติดตัวโคลนนิ่ง Direct Sponsor เท่านั้น
      if (!autoParentId || autoParentId === 0) {
        try {
          const sim = await previewOffChainSimulation(
            signer,
            currentContract,
            sponsorNodeId,
            [{ owner: userAddr }],
            undefined,
            modeToUse
          );
          if (sim.targetParentIds.length > 0) {
            autoParentId = Number(sim.targetParentIds[0]);
            autoIsLeft = Boolean(sim.isLefts[0]);
          }
        } catch (simErr) {
          console.warn('Simulation notice:', simErr);
        }
      }

      const sideLabel = autoIsLeft ? 'LEFT ลูกซ้าย' : 'RIGHT ลูกขวา';

      setTxState((prev) => ({
        ...prev,
        step:
          autoParentId > 0
            ? `ขั้นตอนที่ 2/2: ส่งลงตำแหน่ง (ต่อติดตัวผู้แนะนำตรง/โคลนนิ่ง) Parent #${autoParentId} (${sideLabel})... กรุณายืนยันใน MetaMask`
            : `ขั้นตอนที่ 2/2: ส่งคำสั่งสมัครใต้ผู้แนะนำ #${sponsorNodeId} ค่าสมัคร 5 USDT... กรุณายืนยันใน MetaMask`,
      }));

      let regTx;
      if (autoParentId > 0) {
        try {
          regTx = await matrixContract.registerBatch(
            BigInt(sponsorNodeId),
            1n,
            [BigInt(autoParentId)],
            [Boolean(autoIsLeft)],
            [false]
          );
        } catch {
          regTx = await matrixContract.register(BigInt(sponsorNodeId));
        }
      } else {
        regTx = await matrixContract.register(BigInt(sponsorNodeId));
      }

      setTxState((prev) => ({
        ...prev,
        step: 'ส่ง Transaction แล้ว กำลังรอการยืนยันบน BNB Smart Chain Testnet...',
        txHash: regTx.hash,
      }));

      const receipt = await regTx.wait();

      // Confirm ticket reservation in Queue
      if (activeTicket?.ticketId) {
        await confirmQueueTicket(activeTicket.ticketId, receipt.hash);
      }

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: receipt.hash,
        error: null,
        successMessage:
          autoParentId > 0
            ? `🎉 สมัครสมาชิกสำเร็จ! ลงตำแหน่งออโต้ที่ Parent #${autoParentId} (${sideLabel}) ภายใต้ผู้แนะนำ #${sponsorNodeId} (จองผ่าน FIFO Queue)`
            : `🎉 สมัครสมาชิก FractalFlowMatrix27 (Rank 1 - 5 USDT) สำเร็จเรียบร้อย! (Sponsor Node ID: #${sponsorNodeId})`,
      });

      await fetch('/api/db/sync', { method: 'POST' }).catch(() => {});
      await refreshUserData(userAddr);

      // อัปเดตผังต้นไม้ไบนารี่ทันทีเมื่อสมัครสำเร็จ
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
      return receipt;
    } catch (err: any) {
      console.error('Register transaction error:', err);
      if (activeTicket?.ticketId) {
        await releaseQueueTicket(activeTicket.ticketId);
      }
      const errorMsg = err?.reason || err?.shortMessage || err?.message || 'การสมัครสมาชิกล้มเหลว';
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: errorMsg,
        successMessage: null,
      });
    }
  };

  // 2. Batch Register: registerBatch(uint256 _sponsorNodeId, uint256 _count, uint256[] _targetParentIds, bool[] _isLefts, bool[] _isClones)
  const handleRegisterBatch = async (
    sponsorNodeId: number,
    count: number,
    targetParentIds: (string | number)[],
    isLefts: boolean[],
    isClones: boolean[]
  ) => {
    setTxState({
      isLoading: true,
      step: `กำลังเตรียมข้อมูล registerBatch จำนวน ${count} โหนด...`,
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      const { signer, userAddr } = await ensureWalletAndBscTestnet();
      const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
      const currentUsdt = usdtAddressRef.current || USDT_ADDRESS;

      const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, signer);
      const usdtContract = new ethers.Contract(currentUsdt, USDT_ABI, signer);

      let usdtDecimals = 18;
      try {
        usdtDecimals = Number(await usdtContract.decimals());
      } catch {
        usdtDecimals = 18;
      }

      let unitPrice: bigint;
      try {
        unitPrice = await matrixContract.rankPrice(1);
      } catch {
        unitPrice = ethers.parseUnits('5', usdtDecimals);
      }

      const totalCost = unitPrice * BigInt(count);

      setTxState((prev) => ({
        ...prev,
        step: `ตรวจสอบสิทธิ์ USDT Allowance สำหรับ ${count} โหนด (รวม ${count * 5} USDT)...`,
      }));

      const currentAllowance = await usdtContract.allowance(userAddr, currentContract);
      if (currentAllowance < totalCost) {
        setTxState((prev) => ({
          ...prev,
          step: 'กรุณายืนยันการอนุมัติวงเงินไม่จำกัด (Approve Unlimited USDT) สำหรับสมัครแบบกลุ่มใน MetaMask...',
        }));
        const approveTx = await usdtContract.approve(currentContract, ethers.MaxUint256, {
          gasLimit: 100000n,
        });
        setTxState((prev) => ({
          ...prev,
          step: 'กำลังรอการยืนยัน Approve USDT บนบล็อกเชน...',
          txHash: approveTx.hash,
        }));
        await approveTx.wait();
      }

      const formattedParentIds = targetParentIds.map((id) => BigInt(id));

      setTxState((prev) => ({
        ...prev,
        step: `กำลังส่งคำสั่ง registerBatch(${sponsorNodeId}, ${count}, [...]) เข้า Smart Contract...`,
      }));

      const batchTx = await matrixContract.registerBatch(
        BigInt(sponsorNodeId),
        BigInt(count),
        formattedParentIds,
        isLefts,
        isClones
      );

      setTxState((prev) => ({
        ...prev,
        step: 'ส่ง Batch Transaction แล้ว รอการยืนยันบน BNB Testnet...',
        txHash: batchTx.hash,
      }));

      const receipt = await batchTx.wait();

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: receipt.hash,
        error: null,
        successMessage: `🎉 สมัครแบบกลุ่ม (Batch Registration ${count} โหนด = ${count * 5} USDT) สำเร็จเรียบร้อย!`,
      });

      await fetch('/api/db/sync', { method: 'POST' }).catch(() => {});
      await refreshUserData(userAddr);

      // อัปเดตผังต้นไม้ไบนารี่ทันทีเมื่อสมัครสำเร็จ
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
      return receipt;
    } catch (err: any) {
      console.error('Batch Register error:', err);
      const errorMsg = err?.reason || err?.shortMessage || err?.message || 'การทำรายการ registerBatch ล้มเหลว';
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: errorMsg,
        successMessage: null,
      });
    }
  };

  // 3. Upgrade Rank: upgradeRankForMainId(uint256 _r1MainId, uint8 _targetRank) / upgradeRank(uint8 _targetRank)
  const handleUpgradeRank = async (targetRank: number, targetMainId?: number | string) => {
    const mIdNum = Number(targetMainId) || Number(profile?.mainNodeIdRank1) || 1;
    const nominalPrice = RANK_PRICES_USDT[targetRank - 1] || 10;

    setTxState({
      isLoading: true,
      step: `กำลังตรวจสอบข้อมูลสำหรับอัปเกรดแรงค์ ${targetRank}${mIdNum > 0 ? ` (รหัสหลัก #${mIdNum})` : ''}...`,
      txHash: null,
      error: null,
      successMessage: null,
    });

    let mainIdOwner = '';
    let dbUpgradeRankPool = 0;

    if (mIdNum > 0) {
      try {
        const infoRes = await fetch(`/api/matrix/main-id/${mIdNum}`);
        const info = await infoRes.json();
        if (info && info.success) {
          if (info.owner) mainIdOwner = String(info.owner);
          if (typeof info.upgradeRankPool === 'number') {
            dbUpgradeRankPool = info.upgradeRankPool;
          }
          if (typeof info.currentRank === 'number' && targetRank <= info.currentRank) {
            setTxState({
              isLoading: false,
              step: '',
              txHash: null,
              error: `รหัสหลัก #${mIdNum} อยู่ใน Rank ${info.currentRank} เรียบร้อยแล้ว (ไม่สามารถกดย้อนหลังสู่ Rank ${targetRank} ได้)`,
              successMessage: null,
            });
            return;
          }
        }
      } catch {
        // ignore info fetch error
      }
    }

    try {
      let signer: ethers.Signer | null = null;
      let userAddr = account || '';

      if (window.ethereum) {
        try {
          const res = await ensureWalletAndBscTestnet();
          signer = res.signer;
          userAddr = res.userAddr;
        } catch (walletErr: any) {
          console.warn('Browser wallet connect notice during upgrade:', walletErr);
        }
      }

      const isWalletOwnerOfMainId =
        !mainIdOwner ||
        mainIdOwner === ethers.ZeroAddress ||
        (userAddr && userAddr.toLowerCase() === mainIdOwner.toLowerCase());

      if (signer && userAddr && isWalletOwnerOfMainId) {
        try {
          // Option A: On-Chain Transaction via MetaMask / Web3 Wallet
          const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
          const currentUsdt = usdtAddressRef.current || USDT_ADDRESS;

          const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, signer);
          const usdtContract = new ethers.Contract(currentUsdt, USDT_ABI, signer);

          let usdtDecimals = 18;
          try {
            usdtDecimals = Number(await usdtContract.decimals());
          } catch {
            usdtDecimals = 18;
          }

          let targetPrice: bigint;
          try {
            targetPrice = await matrixContract.rankPrice(targetRank);
          } catch {
            targetPrice = ethers.parseUnits(nominalPrice.toString(), usdtDecimals);
          }

          let savedInVault: bigint = BigInt(0);
          try {
            if (mIdNum > 0 && typeof matrixContract.getAccumulatedVaultForMainId === 'function') {
              try {
                savedInVault = await matrixContract.getAccumulatedVaultForMainId(BigInt(mIdNum));
              } catch {
                savedInVault = ethers.parseUnits(dbUpgradeRankPool.toFixed(2), usdtDecimals);
              }
            } else {
              savedInVault = await matrixContract.getAccumulatedVault(userAddr, Number(targetRank));
            }
          } catch {
            savedInVault = ethers.parseUnits(dbUpgradeRankPool.toFixed(2), usdtDecimals);
          }

          const amountToPay = targetPrice > savedInVault ? targetPrice - savedInVault : BigInt(0);
          const formattedDiffUsdt = Number(ethers.formatUnits(amountToPay, usdtDecimals)).toFixed(2);
          const vaultDeductedBn = savedInVault > targetPrice ? targetPrice : savedInVault;
          const formattedVaultDeducted = Number(ethers.formatUnits(vaultDeductedBn, usdtDecimals)).toFixed(2);

          // Pre-check staticCall before asking for USDT approval if possible, or check allowance first
          if (amountToPay > BigInt(0)) {
            setTxState((prev) => ({
              ...prev,
              step: `ตรวจสอบสิทธิ์อนุมัติเหรียญ USDT สำหรับเงินส่วนต่าง ${formattedDiffUsdt} USDT (หักลบ Vault ${formattedVaultDeducted} USDT)...`,
            }));

            const currentAllowance = await usdtContract.allowance(userAddr, currentContract);
            if (currentAllowance < amountToPay) {
              setTxState((prev) => ({
                ...prev,
                step: `ขั้นตอนที่ 1/2: กรุณากดยืนยันอนุมัติวงเงินส่วนต่าง ${formattedDiffUsdt} USDT ใน MetaMask...`,
              }));
              const approveTx = await usdtContract.approve(currentContract, ethers.MaxUint256, {
                gasLimit: 100000n,
              });
              setTxState((prev) => ({
                ...prev,
                step: `ส่งคำสั่งอนุมัติวงเงินส่วนต่าง (${formattedDiffUsdt} USDT) แล้ว กำลังรอการยืนยันบน BNB Testnet...`,
                txHash: approveTx.hash,
              }));
              await approveTx.wait();
            }
          }

          let upgradeTx: any = null;

          if (mIdNum > 0 && typeof matrixContract.upgradeRankForMainId === 'function') {
            await matrixContract.upgradeRankForMainId.staticCall(BigInt(mIdNum), Number(targetRank));
            setTxState((prev) => ({
              ...prev,
              step: `กำลังส่งคำสั่งอัปเกรดแรงค์ ${targetRank} สำหรับรหัสหลัก #${mIdNum}... กรุณายืนยันใน MetaMask`,
            }));
            upgradeTx = await matrixContract.upgradeRankForMainId(BigInt(mIdNum), Number(targetRank));
          } else {
            await matrixContract.upgradeRank.staticCall(Number(targetRank));
            setTxState((prev) => ({
              ...prev,
              step: `กำลังส่งคำสั่งอัปเกรดแรงค์ ${targetRank}... กรุณายืนยันใน MetaMask`,
            }));
            upgradeTx = await matrixContract.upgradeRank(Number(targetRank));
          }

          setTxState((prev) => ({
            ...prev,
            step: 'ส่ง Transaction แล้ว รอการประมวลผลบนบล็อกเชน...',
            txHash: upgradeTx.hash,
          }));

          const receipt = await upgradeTx.wait();

          setTxState({
            isLoading: false,
            step: 'สำเร็จ!',
            txHash: receipt.hash,
            error: null,
            successMessage: `🚀 อัปเกรด${mIdNum > 0 ? `รหัสหลัก #${mIdNum} ` : ''}สู่แรงค์ ${targetRank} (${nominalPrice} USDT) บนบล็อกเชนสำเร็จเรียบร้อย!`,
          });

          await fetch('/api/db/sync', { method: 'POST' }).catch(() => {});
          await refreshUserData(userAddr);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
          }
          return receipt;
        } catch (onChainErr: any) {
          const rawErrMsg = String(
            onChainErr?.reason || onChainErr?.shortMessage || onChainErr?.message || ''
          );
          const isUserRejected =
            onChainErr?.code === 4001 ||
            onChainErr?.code === 'ACTION_REJECTED' ||
            rawErrMsg.toLowerCase().includes('user rejected') ||
            rawErrMsg.toLowerCase().includes('user denied');

          if (isUserRejected) {
            throw new Error('ยกเลิกการทำรายการในกระเป๋า Web3 (User Rejected)');
          }

          console.warn(
            `[Upgrade] On-chain upgrade notice for Main ID #${mIdNum} -> Rank ${targetRank}, proceeding with Database Upgrade Engine:`,
            rawErrMsg
          );
        }
      }

      // Option B: Database / Per-Main-ID Upgrade Engine
      setTxState((prev) => ({
        ...prev,
        step: `กำลังประมวลผลอัปเกรดแรงค์ ${targetRank} สำหรับรหัสหลัก #${mIdNum}...`,
      }));

      const res = await fetch('/api/matrix/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRank,
          mainId: mIdNum,
          owner: mainIdOwner || userAddr || account,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        const adminRes = await fetch('/api/admin/upgrade-rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUser: mainIdOwner || userAddr || account,
            mainId: mIdNum,
            targetRank,
          }),
        });
        const adminJson = await adminRes.json();
        if (!adminRes.ok || !adminJson.success) {
          throw new Error(adminJson.error || json.error || 'ไม่สามารถอัปเกรดแรงค์ได้');
        }
      }

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: json.txHash || `0xupg${Date.now().toString(16)}`,
        error: null,
        successMessage:
          json.message ||
          `🚀 อัปเกรดรหัสหลัก #${mIdNum} สู่แรงค์ ${targetRank} (${nominalPrice} USDT) สำเร็จเรียบร้อย!`,
      });

      await refreshUserData(mainIdOwner || userAddr || account || '0x622E20082e63c7220c5AF0A77Cbc437a98505311');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
    } catch (err: any) {
      console.error('Upgrade transaction error:', err);
      const errorMsg = err?.reason || err?.shortMessage || err?.message || 'การอัปเกรดแรงค์ล้มเหลว';
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: errorMsg,
        successMessage: null,
      });
    }
  };

  // 4A. Process Auto New Main ID (Vault 1-4) - Scoped to Main ID (Idหลักนั้นๆ)
  const handleProcessAutoNewMainId = async (targetMainId?: number | string) => {
    setTxState({
      isLoading: true,
      step: `กำลังส่งคำสั่ง checkAndProcessAutoNewMainId${targetMainId ? ` สำหรับรหัสหลัก #${targetMainId}` : ''}...`,
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      const { signer, userAddr } = await ensureWalletAndBscTestnet();
      const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
      const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, signer);
      const totalBefore = Number(await matrixContract.totalNodesInRank(1).catch(() => 0n));

      const mIdNum = Number(targetMainId);
      let tx: any;
      if (mIdNum > 0 && typeof matrixContract.checkAndProcessAutoNewMainIdForNode === 'function') {
        try {
          tx = await matrixContract.checkAndProcessAutoNewMainIdForNode(mIdNum);
        } catch {
          tx = await matrixContract.checkAndProcessAutoNewMainId(userAddr);
        }
      } else {
        tx = await matrixContract.checkAndProcessAutoNewMainId(userAddr);
      }

      setTxState((prev) => ({
        ...prev,
        step: 'กำลังรอการยืนยันบนบล็อกเชน...',
        txHash: tx.hash,
      }));

      const receipt = await tx.wait();
      const totalAfter = Number(await matrixContract.totalNodesInRank(1).catch(() => BigInt(totalBefore)));
      const createdNodesCount = Math.max(0, totalAfter - totalBefore);

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: receipt.hash,
        error: null,
        successMessage: createdNodesCount > 0
          ? `✨ สร้าง Auto New Main ID จากยอดสะสม Vault สำเร็จ (+${createdNodesCount} รหัสหลักใหม่)!`
          : `✨ ตรวจสอบและประมวลผลคำสั่ง Auto New Main ID บนบล็อกเชนเรียบร้อยแล้ว`,
      });

      await fetch('/api/db/sync', { method: 'POST' }).catch(() => {});
      await refreshUserData(userAddr);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
      return receipt;
    } catch (err: any) {
      const errorMsg = err?.reason || err?.shortMessage || err?.message || 'ไม่สามารถประมวลผล Auto New Main ID ได้';
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: errorMsg,
        successMessage: null,
      });
    }
  };

  // 4B. Process Auto Extra ID - Scoped to Main ID (Idหลักนั้นๆ)
  const handleProcessAutoExtraId = async (currentRank = 2, targetMainId?: number | string) => {
    if (currentRank < 2 || currentRank > 27) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: 'Auto Extra ID รองรับเฉพาะ Rank 2 ถึง Rank 27',
        successMessage: null,
      });
      return;
    }

    setTxState({
      isLoading: true,
      step: `กำลังส่งคำสั่ง checkAndProcessAutoExtraId สำหรับแรงค์ ${currentRank}${targetMainId ? ` (รหัสหลัก #${targetMainId})` : ''}...`,
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      const mIdNum = Math.max(1, Number(targetMainId) || Number(profile?.mainNodeIdRank1) || 1);
      let receipt: any = null;
      let createdNodesCount = 0;

      try {
        const { signer, userAddr } = await ensureWalletAndBscTestnet();
        const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
        const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, signer);
        const totalBefore = Number(await matrixContract.totalNodesInRank(currentRank).catch(() => 0n));

        let tx: any;
        if (mIdNum > 0 && typeof matrixContract.checkAndProcessAutoExtraIdForNode === 'function') {
          try {
            tx = await matrixContract.checkAndProcessAutoExtraIdForNode(userAddr, currentRank, mIdNum);
          } catch {
            tx = await matrixContract.checkAndProcessAutoExtraId(userAddr, currentRank);
          }
        } else {
          tx = await matrixContract.checkAndProcessAutoExtraId(userAddr, currentRank);
        }

        setTxState((prev) => ({
          ...prev,
          step: 'กำลังรอการยืนยันบนบล็อกเชน...',
          txHash: tx.hash,
        }));

        receipt = await tx.wait();
        const totalAfter = Number(await matrixContract.totalNodesInRank(currentRank).catch(() => BigInt(totalBefore)));
        createdNodesCount = Math.max(0, totalAfter - totalBefore);
      } catch (chainErr) {
        console.warn('On-chain Auto Extra ID notice, reconciling via Database:', chainErr);
      }

      const apiRes = await fetch('/api/matrix/auto-extra-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainId: mIdNum, targetRank: currentRank }),
      }).catch(() => null);

      let dbCreatedCount = 0;
      let dbCreatedRank = currentRank;
      if (apiRes && apiRes.ok) {
        const apiJson = await apiRes.json();
        dbCreatedCount = Number(apiJson?.createdCount || 0);
        if (Array.isArray(apiJson?.createdNodes) && apiJson.createdNodes.length > 0) {
          dbCreatedRank = Number(apiJson.createdNodes[0].targetRank || currentRank);
        }
      }

      const effectiveCount = Math.max(createdNodesCount, dbCreatedCount);

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: receipt?.hash || null,
        error: null,
        successMessage:
          effectiveCount > 0
            ? `✨ ปลดล็อกสร้าง Auto Extra ID ของรหัสหลัก #${mIdNum} ใน Rank ${dbCreatedRank} สำเร็จ (+${effectiveCount} รหัส Extra ID)!`
            : `⚠️ ยอดสะสม New Extra ID Pool ของรหัสหลัก #${mIdNum} ยังไม่ครบตามราคา Rank เป้าหมาย`,
      });

      if (account) {
        await refreshUserData(account);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
      return receipt;
    } catch (err: any) {
      const errorMsg = err?.reason || err?.shortMessage || err?.message || 'ไม่สามารถประมวลผล Auto Extra ID ได้';
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: errorMsg,
        successMessage: null,
      });
    }
  };


  const handleExecuteOffChainSimulationAndBatch = async (
    sponsorNodeId: number,
    applicantsQueue: ApplicantItem[],
    onStatusCallback?: (msg: string) => void,
    mode: PlacementMode = 'contract_round'
  ) => {
    setTxState({
      isLoading: true,
      step: 'กำลังคำนวณหาตำแหน่งที่จะลงออโต้สำหรับทุกโหนด (Auto-Placement Batch)...',
      txHash: null,
      error: null,
      successMessage: null,
    });

    let activeBatchTicket: any = null;

    try {
      const { signer, userAddr } = await ensureWalletAndBscTestnet();

      try {
        setTxState((prev) => ({
          ...prev,
          step: `กำลังขอตั๋วคิว FIFO สำหรับชุดโหนด ${applicantsQueue.length} รหัส (ป้องกันการแย่งตำแหน่ง)...`,
        }));
        activeBatchTicket = await requestQueuePlacementReservation({
          owner: userAddr,
          sponsorNodeId,
          count: applicantsQueue.length,
          rank: 1,
          mode,
          applicants: applicantsQueue,
        });
      } catch (qErr) {
        console.warn('Queue batch reservation notice:', qErr);
      }

      const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
      const result = await executeOffChainSimulationAndBatch(
        signer,
        currentContract,
        sponsorNodeId,
        applicantsQueue,
        (msg: string) => {
          setTxState((prev) => ({ ...prev, step: msg }));
          if (onStatusCallback) onStatusCallback(msg);
        },
        mode
      );

      if (result.success) {
        if (activeBatchTicket?.ticketId) {
          await confirmQueueTicket(activeBatchTicket.ticketId, result.txHash);
        }
        setTxState({
          isLoading: false,
          step: 'สำเร็จ!',
          txHash: result.txHash || null,
          error: null,
          successMessage: `🎉 สมัครแบบกลุ่ม (${applicantsQueue.length} โหนด) ลงตำแหน่งออโต้สำเร็จ! Tx: ${result.txHash} (ผ่านระบบ FIFO Queue)`,
        });
        await fetch('/api/db/sync', { method: 'POST' }).catch(() => {});
        await refreshUserData(userAddr);

        // อัปเดตผังต้นไม้ไบนารี่ทันทีเมื่อสมัครแบบกลุ่มสำเร็จ
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
        }
      } else {
        if (activeBatchTicket?.ticketId) {
          await releaseQueueTicket(activeBatchTicket.ticketId);
        }
        setTxState({
          isLoading: false,
          step: '',
          txHash: null,
          error: result.error || 'เกิดข้อผิดพลาดในการทำรายการ',
          successMessage: null,
        });
      }

      return result;
    } catch (err: any) {
      if (activeBatchTicket?.ticketId) {
        await releaseQueueTicket(activeBatchTicket.ticketId);
      }
      const errorMsg = err?.reason || err?.shortMessage || err?.message || 'เกิดข้อผิดพลาด';
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: errorMsg,
        successMessage: null,
      });
      return { success: false, error: errorMsg };
    }
  };

  const inspectRankData = useCallback(
    async (rank: number) => {
      const rankNum = Math.min(Math.max(Number(rank) || 1, 1), 27);
      const nextPriceNum = rankNum < 27 ? RANK_PRICES_USDT[rankNum] : 0;
      const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;

      // 1. Read from our Database first (/api/matrix/inspect-rank)
      try {
        const dbRes = await fetch(
          `/api/matrix/inspect-rank?rank=${rankNum}&address=${account || ''}&contract=${currentContract}`,
          { headers: { Accept: 'application/json' } }
        );
        if (dbRes.ok) {
          const dbJson = await dbRes.json();
          if (dbJson && dbJson.success) {
            return {
              firstNodeId: String(dbJson.firstNodeId || '0'),
              latestNodeId: String(dbJson.latestNodeId || '0'),
              upgradeVaultBalance: String(dbJson.upgradeVaultBalance || '0.00'),
              nextRankPrice: String(dbJson.nextRankPrice || (nextPriceNum > 0 ? `${nextPriceNum.toFixed(2)} USDT` : 'Max Rank')),
            };
          }
        }
      } catch {
        // Fallback to profile or RPC below
      }

      // 2. Fallback to already-loaded profile vaults from Database
      const matchingVault = profile?.vaults?.find((v) => v.rank === rankNum);
      if (matchingVault) {
        return {
          firstNodeId: matchingVault.firstNodeId || (rankNum === 1 ? profile?.mainNodeIdRank1 || '1' : '0'),
          latestNodeId: matchingVault.latestNodeId || (rankNum === 1 ? profile?.latestCloneIdRank1 || '0' : '0'),
          upgradeVaultBalance: matchingVault.balance || '0.00',
          nextRankPrice: nextPriceNum > 0 ? `${nextPriceNum.toFixed(2)} USDT` : 'Max Rank',
        };
      }

      // 3. Final fallback to direct RPC
      try {
        const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, readOnlyBscProvider);
        let targetAddr = account;
        if (!targetAddr) {
          const node1 = await matrixContract.rankNodes(rankNum, 1);
          targetAddr = String(node1.owner ?? node1[1] ?? '');
        }
        if (targetAddr && targetAddr !== ethers.ZeroAddress) {
          const rankInfo = await matrixContract.getUserRankInfo(targetAddr, rankNum);
          let formattedVault = '0.00';
          let formattedNextPrice = nextPriceNum > 0 ? `${nextPriceNum.toFixed(2)} USDT` : 'Max Rank';

          try {
            let effectiveVaultBn: bigint = BigInt(rankInfo[2] ?? 0);
            const firstId = Number(rankInfo[0] ?? 0);
            if (firstId > 0) {
              try {
                const nodeVaultBn: bigint = await matrixContract.nodeUpgradeVault(rankNum, firstId);
                if (nodeVaultBn < effectiveVaultBn) {
                  effectiveVaultBn = nodeVaultBn;
                }
              } catch {
                // Fallback
              }
            }
            const dec = effectiveVaultBn >= 100000000000000n || rankInfo[3] >= 100000000000000n ? 18 : 6;
            formattedVault = Number(ethers.formatUnits(effectiveVaultBn, dec)).toFixed(2);
            if (rankInfo[3] > 0n) {
              formattedNextPrice = `${Number(ethers.formatUnits(rankInfo[3], dec)).toFixed(2)} USDT`;
            } else {
              formattedNextPrice = 'Max Rank';
            }
          } catch {
            formattedVault = '0.00';
          }

          return {
            firstNodeId: rankInfo[0].toString(),
            latestNodeId: rankInfo[1].toString(),
            upgradeVaultBalance: formattedVault,
            nextRankPrice: formattedNextPrice,
          };
        }
      } catch {
        // Ignore
      }

      return {
        firstNodeId: rankNum === 1 ? profile?.mainNodeIdRank1 || '1' : '0',
        latestNodeId: rankNum === 1 ? profile?.latestCloneIdRank1 || '0' : '0',
        upgradeVaultBalance: '0.00',
        nextRankPrice: nextPriceNum > 0 ? `${nextPriceNum.toFixed(2)} USDT` : 'Max Rank',
      };
    },
    [account, profile]
  );

  const handleAdminUpgrade = async (targetUserOrId: string, targetRank: number) => {
    const raw = String(targetUserOrId || '').trim().replace(/^#/, '');
    const isId = /^\d+$/.test(raw);
    const isAddr = ethers.isAddress(raw);
    if (!isId && !isAddr) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: 'กรุณากรอกเลข ID หลัก (เช่น 5 หรือ #5) หรือ Wallet Address ที่ถูกต้อง',
        successMessage: null,
      });
      return;
    }

    const targetLabel = isId ? `รหัสหลัก #${raw}` : `${raw.substring(0, 8)}...`;
    setTxState({
      isLoading: true,
      step: `กำลังส่งคำสั่ง Admin Upgrade Rank ${targetRank} ให้ ${targetLabel}...`,
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      let txHash: string | null = null;
      let usedApi = false;
      let resolvedAddress = isAddr ? raw : '';

      // ถ้าป้อนเป็นเลข ID ลอง lookup address เพื่อเตรียมส่ง on-chain
      if (isId && !resolvedAddress) {
        try {
          const lRes = await fetch(`/api/admin/lookup-target?query=${raw}`);
          const lData = await lRes.json();
          if (lData.success && lData.found && lData.owner) {
            resolvedAddress = lData.owner;
          }
        } catch {
          // ignore lookup error
        }
      }

      // 1. ลองทำรายการ On-Chain หากเชื่อมต่อกระเป๋า Admin อยู่
      if (window.ethereum) {
        try {
          const { signer } = await ensureWalletAndBscTestnet();
          const currentContract = contractAddressRef.current || CONTRACT_ADDRESS;
          const matrixContract = new ethers.Contract(currentContract, MATRIX_ABI, signer);

          let tx;
          if (isId && typeof matrixContract.adminUpgradeRankForMainId === 'function') {
            tx = await matrixContract.adminUpgradeRankForMainId(parseInt(raw, 10), targetRank);
          } else if (resolvedAddress && ethers.isAddress(resolvedAddress)) {
            tx = await matrixContract.adminUpgradeRank(resolvedAddress, targetRank);
          } else {
            usedApi = true;
          }

          if (tx) {
            setTxState((prev) => ({
              ...prev,
              step: 'กำลังรอการยืนยันธุรกรรม Admin Upgrade บนบล็อกเชน...',
              txHash: tx.hash,
            }));
            const receipt = await tx.wait();
            txHash = receipt.hash;
          }
        } catch (onChainErr: any) {
          console.warn('[Admin Upgrade] On-chain attempt notice, falling back to Admin System API:', onChainErr);
          usedApi = true;
        }
      } else {
        usedApi = true;
      }

      // 2. หาก On-chain ไม่สำเร็จ หรือเรียกผ่าน API
      if (usedApi || !txHash) {
        const res = await fetch('/api/admin/upgrade-rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUser: resolvedAddress || (isAddr ? raw : undefined),
            mainId: isId ? parseInt(raw, 10) : undefined,
            targetRank,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Admin upgrade API failed');
        }
        txHash = data.txHash || `0xadmin${Date.now().toString(16)}`;
      }

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash,
        error: null,
        successMessage: `✅ Admin Upgrade สำเร็จ! อัปเกรด ${targetLabel} เป็น Rank ${targetRank} ฟรี (ไม่จ่ายค่าคอม และระบบโคลนนิ่งทำงานปกติ)`,
      });

      if (!usedApi && txHash) {
        await fetch('/api/db/sync', { method: 'POST' }).catch(() => {});
      }
      if (account) await refreshUserData(account);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
    } catch (err: any) {
      console.error('handleAdminUpgrade error:', err);
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: err.message || 'Admin Upgrade ล้มเหลว',
        successMessage: null,
      });
    }
  };

  const updateSmartContractAddress = async (newContract: string, newUsdt?: string) => {
    if (!newContract || !ethers.isAddress(newContract)) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: 'รูปแบบที่อยู่ Smart Contract ไม่ถูกต้อง (Invalid Ethereum/BSC Address 0x...)',
        successMessage: null,
      });
      return false;
    }

    if (newUsdt && !ethers.isAddress(newUsdt)) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: 'รูปแบบที่อยู่ USDT Token ไม่ถูกต้อง (Invalid Address 0x...)',
        successMessage: null,
      });
      return false;
    }

    setTxState({
      isLoading: true,
      step: `กำลังบันทึกที่อยู่ Smart Contract (${newContract.substring(0, 10)}...) ลง Database...`,
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      const res = await fetch('/api/config/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractAddress: newContract.trim(),
          usdtAddress: newUsdt ? newUsdt.trim() : usdtAddressRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'บันทึกลง Database ล้มเหลว');
      }

      setContractAddress(newContract.trim());
      contractAddressRef.current = newContract.trim();
      if (newUsdt) {
        setUsdtAddress(newUsdt.trim());
        usdtAddressRef.current = newUsdt.trim();
      }
      setDynamicContractConfig(newContract.trim(), newUsdt ? newUsdt.trim() : usdtAddressRef.current);

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: null,
        error: null,
        successMessage: `💾 บันทึกที่อยู่ Smart Contract ใหม่ (${newContract.substring(0, 8)}...${newContract.substring(38)}) ลง Database สำเร็จแล้ว! ระบบเริ่มใช้งานสัญญานี้ทันที`,
      });

      if (account) {
        await refreshUserData(account, newContract.trim(), newUsdt ? newUsdt.trim() : usdtAddressRef.current);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
      return true;
    } catch (err: any) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: err.message || 'บันทึกลง Database ไม่สำเร็จ',
        successMessage: null,
      });
      return false;
    }
  };

  const resetSmartContractAddress = async () => {
    setTxState({
      isLoading: true,
      step: 'กำลังคืนค่าที่อยู่ Smart Contract บน Database เป็นค่าเริ่มต้น...',
      txHash: null,
      error: null,
      successMessage: null,
    });

    try {
      const res = await fetch('/api/config/contract/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'คืนค่าไม่สำเร็จ');
      }

      clearDynamicContractConfig();
      setContractAddress(DEFAULT_CONTRACT_ADDRESS);
      contractAddressRef.current = DEFAULT_CONTRACT_ADDRESS;
      setUsdtAddress(DEFAULT_USDT_ADDRESS);
      usdtAddressRef.current = DEFAULT_USDT_ADDRESS;

      setTxState({
        isLoading: false,
        step: 'สำเร็จ!',
        txHash: null,
        error: null,
        successMessage: '🔄 คืนค่า Smart Contract บน Database เป็นค่าเริ่มต้นโรงงานเรียบร้อยแล้ว',
      });

      if (account) {
        await refreshUserData(account, DEFAULT_CONTRACT_ADDRESS, DEFAULT_USDT_ADDRESS);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
      return true;
    } catch (err: any) {
      setTxState({
        isLoading: false,
        step: '',
        txHash: null,
        error: err.message || 'คืนค่าไม่สำเร็จ',
        successMessage: null,
      });
      return false;
    }
  };

  const clearTxState = () => {
    setTxState({
      isLoading: false,
      step: '',
      txHash: null,
      error: null,
      successMessage: null,
    });
  };

  return {
    contractAddress,
    usdtAddress,
    updateSmartContractAddress,
    resetSmartContractAddress,
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
    txState,
    connectWallet,
    loginWithCustomInput,
    loginWithDemoUnregisteredWallet,
    disconnectWallet,
    switchToBscTestnet,
    refreshUserData: () => account && refreshUserData(account),
    checkSponsorNode,
    previewNextPlacement,
    inspectRankData,
    handleApproveUsdt,
    handleRegister,
    handleRegisterBatch,
    handleExecuteOffChainSimulationAndBatch,
    handleUpgradeRank,
    handleAdminUpgrade,
    handleProcessAutoNewMainId,
    handleProcessAutoExtraId,
    requestQueuePlacementReservation,
    releaseQueueTicket,
    fetchQueueStatus,
    clearTxState,
  };
}
