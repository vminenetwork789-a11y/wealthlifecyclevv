import { ethers } from 'ethers';
import {
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  USDT_ADDRESS,
  BSC_TESTNET_RPC,
  BSC_TESTNET_PARAMS,
} from '../contracts/config';

export type PlacementMode = 'auto_under_sponsor' | 'global_bfs' | 'contract_round';

export interface InMemoryMatrixNode {
  id: bigint;
  owner: string;
  directSponsor: string;
  parentId: bigint;
  leftChild: bigint;
  rightChild: bigint;
  isClone: boolean;
  originMainId?: string;
  directSponsorNodeId?: string;
}

export interface WalletNodeDetail {
  id: string;
  owner: string;
  directSponsor: string;
  parentId: string;
  leftChild: string;
  rightChild: string;
  isClone: boolean;
  originMainId?: string;
  spawnedFromNodeId?: string;
  cloneRound?: number;
  subCloneDepth?: number;
}

export interface CloneLineageMeta {
  nodeId: string;
  isClone: boolean;
  originMainId: string;
  spawnedFromNodeId: string;
  cloneRound: number;
  subCloneDepth: number;
}

export type RankNodesMap = Record<string, InMemoryMatrixNode>;

export interface OwnerProfileCache {
  sponsor: string;
  firstNodeId: bigint;
  latestNodeId: bigint;
}

export interface ApplicantItem {
  owner: string;
}

export interface SpawnedCloneStep {
  cloneNodeId: string;
  cloneOwner: string;
  triggeredByParentId: string;
  cloneParentId: string;
  cloneIsLeft: boolean;
}

export interface SimulationStepLog {
  applicantIndex: number;
  owner: string;
  assignedNodeId: string;
  targetParentId: string;
  isLeft: boolean;
  roundToggleUsed: number;
  spawnedClone?: {
    cloneNodeId: string;
    cloneOwner: string;
    cloneParentId: string;
    cloneIsLeft: boolean;
  };
  spawnedClones?: SpawnedCloneStep[];
}

const RPC_ENDPOINTS = [
  BSC_TESTNET_RPC,
  ...BSC_TESTNET_PARAMS.rpcUrls.filter((u) => u !== BSC_TESTNET_RPC),
];

let cachedSimulatorProvider: ethers.JsonRpcProvider | null = null;

async function getWorkingReadProvider(
  preferred?: ethers.Provider | ethers.Signer | null
): Promise<ethers.Provider> {
  if (preferred) {
    if ('provider' in preferred && preferred.provider) {
      return preferred.provider;
    }
    if ('getBlockNumber' in preferred) {
      return preferred as ethers.Provider;
    }
  }

  if (cachedSimulatorProvider) {
    return cachedSimulatorProvider;
  }

  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      const p = new ethers.JsonRpcProvider(
        rpcUrl,
        { chainId: 97, name: 'bnbt' },
        { staticNetwork: true, polling: false, batchMaxCount: 1 }
      );
      p.on('error', () => {});
      await p.getBlockNumber();
      cachedSimulatorProvider = p;
      return p;
    } catch {
      continue;
    }
  }

  const fallback = new ethers.JsonRpcProvider(
    BSC_TESTNET_RPC,
    { chainId: 97, name: 'bnbt' },
    { staticNetwork: true, polling: false, batchMaxCount: 1 }
  );
  fallback.on('error', () => {});
  cachedSimulatorProvider = fallback;
  return fallback;
}

// --- 1. ฟังก์ชันค้นหาช่องว่างแบบ BFS (สแกนเรียงจาก Root #1 ซ้ายไปขวา อัตโนมัติ) ---
export function findFirstAvailableUnder(
  rankNodes: RankNodesMap,
  startNodeId: bigint | number
): { parentId: bigint; isLeft: boolean } {
  const startKey = BigInt(startNodeId || 1).toString();
  if (!rankNodes[startKey]) {
    // Fallback to root #1 if startNodeId is not in map
    if (rankNodes['1']) {
      return findFirstAvailableUnder(rankNodes, 1n);
    }
    return { parentId: 1n, isLeft: true };
  }

  const queue: bigint[] = [BigInt(startNodeId)];
  const visited = new Set<string>();
  let head = 0;

  while (head < queue.length) {
    const currentId = queue[head++];
    const key = currentId.toString();
    if (visited.has(key)) continue;
    visited.add(key);

    const node = rankNodes[key];
    if (!node) continue;

    if (node.leftChild === 0n) return { parentId: currentId, isLeft: true };
    if (node.rightChild === 0n) return { parentId: currentId, isLeft: false };

    if (node.leftChild > 0n) queue.push(node.leftChild);
    if (node.rightChild > 0n) queue.push(node.rightChild);
  }

  return { parentId: BigInt(startNodeId), isLeft: true };
}

// --- 2. ฟังก์ชันจำลองการหาตำแหน่งตามกฎ _findPlacementWithRound ของ Smart Contract ---
export function simulateSinglePlacement(
  rankNodes: RankNodesMap,
  sponsorAddress: string,
  sponsorFirstNodeId: bigint,
  _sponsorLatestNodeId: bigint,
  currentRoundToggle: number
): { parentId: bigint; isLeft: boolean } {
  if (currentRoundToggle === 0) {
    // การวางตำแหน่งรอบ 1: ต่อติดตัวของผู้แนะนำ (Direct Sponsor Line) และโคลนนิ่งของผู้แนะนำตรงเท่านั้น
    const result = findDirectSponsorOrCloneSlot(rankNodes, sponsorAddress, sponsorFirstNodeId);
    return { parentId: result.parentId, isLeft: result.isLeft };
  } else {
    // การวางตำแหน่งรอบ 2: ค้นหาแบบ "กว้างนำยาว" (BFS ทีละชั้นแนวระนาบ เริ่มจาก Root Node #1)
    return findFirstAvailableUnder(rankNodes, 1n);
  }
}

/**
 * คำนวณสายตระกูลโคลนนิ่ง (Clone Lineage: originMainId / รหัสหลักต้นสังกัด)
 * โดยตรวจสอบว่าลูกขวา (Right Child) ของโหนดใดเป็นตัวจุดชนวนให้เกิดโคลนนั้นๆ
 * ทำให้แยกได้อย่างแม่นยำว่า โคลน #8 เป็นของรหัสหลัก #2 (#2 #8 #0 รอบ 1)
 * และ โคลน #24 เป็นของรหัสหลัก #6 (#6 #24 #0 รอบ 1) แม้จะอยู่ในกระเป๋าเดียวกัน
 */
export function buildCloneLineageMap(
  rankNodes: RankNodesMap
): Map<string, CloneLineageMeta> {
  const lineageMap = new Map<string, CloneLineageMeta>();
  const matchedRightTriggers = new Set<string>();
  const ownerPrimaryNodeMap = new Map<string, string>();
  const ownerAllMainNodesMap = new Map<string, string[]>();
  const mainNodeCloneRoundCount = new Map<string, number>();

  const sortedIds = Object.keys(rankNodes)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const isAncestorOf = (candidateAncestorId: string, targetId: string): boolean => {
    if (!candidateAncestorId || candidateAncestorId === '0' || !targetId || targetId === '0') {
      return false;
    }
    let curr = targetId;
    const guard = new Set<string>();
    while (curr && curr !== '0' && !guard.has(curr)) {
      if (curr === candidateAncestorId) return true;
      guard.add(curr);
      const p = rankNodes[curr];
      curr = p ? p.parentId.toString() : '0';
    }
    return false;
  };

  for (const numId of sortedIds) {
    const idStr = String(numId);
    const n = rankNodes[idStr];
    if (!n) continue;
    const ownerKey = (n.owner || '').toLowerCase();

    if (!n.isClone) {
      if (!ownerPrimaryNodeMap.has(ownerKey)) {
        ownerPrimaryNodeMap.set(ownerKey, idStr);
      }
      const list = ownerAllMainNodesMap.get(ownerKey) || [];
      list.push(idStr);
      ownerAllMainNodesMap.set(ownerKey, list);

      lineageMap.set(idStr, {
        nodeId: idStr,
        isClone: false,
        originMainId: idStr,
        spawnedFromNodeId: '0',
        cloneRound: 0,
        subCloneDepth: 0,
      });
    } else {
      let spawnedFromNodeId = '0';
      const walletFirstId = ownerPrimaryNodeMap.get(ownerKey) || idStr;

      if (n.originMainId && n.originMainId !== '0') {
        const originId = n.originMainId;
        const prevCount = mainNodeCloneRoundCount.get(originId) || 0;
        const currentCount = prevCount + 1;
        mainNodeCloneRoundCount.set(originId, currentCount);
        const cloneRound = ((currentCount - 1) % 2) + 1;
        lineageMap.set(idStr, {
          nodeId: idStr,
          isClone: true,
          originMainId: originId,
          spawnedFromNodeId: originId,
          cloneRound,
          subCloneDepth: 0,
        });
        continue;
      }

      // ตรวจย้อนหลังจาก id - 1 ลงไปหาโหนดที่ลูกขวาเต็มแล้วทำให้เกิดโคลนนี้
      for (let lookback = numId - 1; lookback >= 1; lookback--) {
        const candidateRightChild = rankNodes[String(lookback)];
        if (!candidateRightChild || candidateRightChild.parentId <= 0n) continue;
        const triggerParentIdStr = candidateRightChild.parentId.toString();
        const triggerParent = rankNodes[triggerParentIdStr];
        if (
          triggerParent &&
          triggerParent.rightChild === candidateRightChild.id &&
          (triggerParent.owner || '').toLowerCase() === ownerKey &&
          !matchedRightTriggers.has(triggerParentIdStr)
        ) {
          spawnedFromNodeId = triggerParentIdStr;
          matchedRightTriggers.add(triggerParentIdStr);
          break;
        }
      }

      if (spawnedFromNodeId === '0') {
        const ownerMains = ownerAllMainNodesMap.get(ownerKey) || [];
        const matchingSubtreeMain = [...ownerMains]
          .reverse()
          .find((mId) => Number(mId) < numId && isAncestorOf(mId, idStr));
        spawnedFromNodeId = matchingSubtreeMain || walletFirstId;
      }

      const triggerMeta = lineageMap.get(spawnedFromNodeId);
      let originMainId = spawnedFromNodeId;
      let subCloneDepth = 0;

      if (triggerMeta) {
        originMainId = triggerMeta.isClone ? triggerMeta.originMainId : triggerMeta.nodeId;
        subCloneDepth = triggerMeta.isClone ? triggerMeta.subCloneDepth + 1 : 0;
      }

      const prevCount = mainNodeCloneRoundCount.get(originMainId) || 0;
      const currentCount = prevCount + 1;
      mainNodeCloneRoundCount.set(originMainId, currentCount);
      let cloneRound = ((currentCount - 1) % 2) + 1;

      const targetSponsorId = n.directSponsorNodeId ? n.directSponsorNodeId.toString() : '';
      if (targetSponsorId && targetSponsorId !== '0') {
        const parentIdStr = n.parentId.toString();
        const inSponsorLineage =
          parentIdStr === targetSponsorId || isAncestorOf(targetSponsorId, parentIdStr);
        if (inSponsorLineage) {
          cloneRound = 1;
        } else {
          cloneRound = 2;
        }
      }

      lineageMap.set(idStr, {
        nodeId: idStr,
        isClone: true,
        originMainId,
        spawnedFromNodeId,
        cloneRound,
        subCloneDepth,
      });
    }
  }

  return lineageMap;
}

/**
 * เงื่อนไขสำหรับหาตำแหน่ง สมัครสมาชิก:
 * 1. จะต้องไปต่อติดตัวของผู้แนะนำตรง Direct Sponsor (#sponsorNodeId) ซ้ายก่อน ขวาตาม
 * 2. แต่ถ้าผู้แนะนำตรง (#sponsorNodeId) เต็มทั้ง 2 ข้าง -> ให้ไปวางต่อติดตัวโคลนนิ่งที่เป็นของรหัสหลัก #sponsorNodeId นั้นโดยเฉพาะ (originMainId === sponsorNodeId) ซ้ายก่อน ขวาตาม
 *    เช่น กรอกผู้แนะนำ 2 -> ต้องไปต่อโคลนของ #2 คือ (#2 #8 #0 รอบ 1) เท่านั้น จะไม่ข้ามไปโคลนของ #6 (#6 #24 #0 รอบ 1)
 */
export function findDirectSponsorOrCloneSlot(
  rankNodes: RankNodesMap,
  _sponsorAddress: string,
  sponsorNodeId: number | bigint
): { parentId: bigint; isLeft: boolean; targetType: 'main' | 'clone' | 'descendant'; targetNodeId: bigint } {
  const lineageMap = buildCloneLineageMap(rankNodes);
  const requestedId = BigInt(sponsorNodeId || 1);
  const requestedIdStr = requestedId.toString();
  const requestedNode = rankNodes[requestedIdStr];
  const requestedMeta = lineageMap.get(requestedIdStr);

  // หากระบุเป็นรหัสโคลนโดยตรง ให้ตรวจช่องว่างของโคลนนั้นก่อน
  if (requestedNode && requestedNode.isClone) {
    if (requestedNode.leftChild === 0n) {
      return { parentId: requestedId, isLeft: true, targetType: 'clone', targetNodeId: requestedId };
    }
    if (requestedNode.rightChild === 0n) {
      return { parentId: requestedId, isLeft: false, targetType: 'clone', targetNodeId: requestedId };
    }
  }

  // รหัสหลักเป้าหมาย (เช่น #2)
  const targetMainIdStr = requestedMeta ? requestedMeta.originMainId : requestedIdStr;
  const mainNodeId = BigInt(targetMainIdStr);
  const mainNode = rankNodes[targetMainIdStr];

  // ขั้นตอนที่ 1: ต่อติดตัวของผู้แนะนำตรง Direct Sponsor (#mainNodeId) ซ้ายก่อน ขวาตาม
  if (mainNode) {
    if (mainNode.leftChild === 0n) {
      return { parentId: mainNodeId, isLeft: true, targetType: 'main', targetNodeId: mainNodeId };
    }
    if (mainNode.rightChild === 0n) {
      return { parentId: mainNodeId, isLeft: false, targetType: 'main', targetNodeId: mainNodeId };
    }
  }

  // ขั้นตอนที่ 2: ตรวจสอบเฉพาะโคลนนิ่งที่มีรหัสหลัก (originMainId) ตรงกับ #mainNodeId เท่านั้น!
  // เช่น ผู้แนะนำ #2 -> ดึงเฉพาะโคลนที่มี originMainId === '2' (เช่น #8 [#2 #8 #0 รอบ 1]) ไม่ดึง #24 ที่เป็นของ #6
  const clonesOfThisMainId: Array<{ id: bigint; leftChild: bigint; rightChild: bigint }> = [];

  for (const node of Object.values(rankNodes)) {
    if (!node.isClone) continue;
    const meta = lineageMap.get(node.id.toString());
    if (meta && meta.originMainId === targetMainIdStr) {
      clonesOfThisMainId.push({
        id: node.id,
        leftChild: node.leftChild,
        rightChild: node.rightChild,
      });
    }
  }

  // เรียงลำดับโคลนของรหัสหลักนี้เพื่อหาโคลนที่ยังมีช่องว่างซ้ายหรือขวา (เช่น #8 ที่ซ้ายเต็มแต่ขวาว่าง)
  clonesOfThisMainId.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (clonesOfThisMainId.length > 0) {
    const openClone = clonesOfThisMainId.find((c) => c.leftChild === 0n || c.rightChild === 0n);
    if (openClone) {
      if (openClone.leftChild === 0n) {
        return { parentId: openClone.id, isLeft: true, targetType: 'clone', targetNodeId: openClone.id };
      }
      return { parentId: openClone.id, isLeft: false, targetType: 'clone', targetNodeId: openClone.id };
    }
  }

  // ขั้นตอนที่ 3: หากโหนดหลัก #mainNodeId และโคลนของ #mainNodeId เต็มหมด ให้หาช่องว่างแบบ BFS ใต้ #mainNodeId
  const slot = findFirstAvailableUnder(rankNodes, mainNodeId);
  return { parentId: slot.parentId, isLeft: slot.isLeft, targetType: 'descendant', targetNodeId: mainNodeId };
}

/**
 * เงื่อนไขการวางตำแหน่ง New Auto ID และ Auto Extra ID (เขียนแยกออกจากโคลนนิ่ง):
 * จับคู่โคลนตามรหัสหลักต้นสังกัด (originMainId === sponsorNodeId) เท่านั้น!
 *
 * ขั้นตอนที่ 1: วางต่อติดตัวรหัสหลักต้นสังกัด (#sponsorNodeId) ซ้ายก่อน ขวาตาม
 * ขั้นตอนที่ 2: ถ้ารหัสหลักต้นสังกัดเต็มทั้ง 2 ข้าง -> จับคู่เฉพาะโคลนนิ่งที่มีรหัสหลักต้นสังกัดตรงกัน
 *             (node.isClone && originMainId === sponsorNodeId เท่านั้น) ซ้ายก่อน ขวาตาม
 *             จะไม่ข้ามไปจับคู่โคลนของรหัสหลักอื่นในกระเป๋าเดียวกันเด็ดขาด
 * ขั้นตอนที่ 3: หากรหัสหลักและโคลนในสังกัด (originMainId === sponsorNodeId) เต็มหมด -> ค้นหาช่องว่างแบบ BFS ใต้รหัสหลักนั้น
 */
export function findAutoIdAndExtraIdSlot(
  rankNodes: RankNodesMap,
  _sponsorAddress: string,
  sponsorNodeId: number | bigint
): { parentId: bigint; isLeft: boolean; targetType: 'main' | 'clone' | 'descendant'; originMainId: bigint } {
  const lineageMap = buildCloneLineageMap(rankNodes);
  const requestedId = BigInt(sponsorNodeId || 1);
  const requestedIdStr = requestedId.toString();
  const requestedMeta = lineageMap.get(requestedIdStr);

  // ยึดรหัสหลักต้นสังกัด (originMainId === sponsorNodeId) เท่านั้น
  const sponsorMainIdStr = requestedMeta ? requestedMeta.originMainId : requestedIdStr;
  const sponsorMainId = BigInt(sponsorMainIdStr);
  const mainNode = rankNodes[sponsorMainIdStr];

  // ขั้นตอนที่ 1: ติดตัวรหัสหลักต้นสังกัด (sponsorMainId) ซ้ายก่อน ขวาตาม
  if (mainNode) {
    if (mainNode.leftChild === 0n) {
      return { parentId: sponsorMainId, isLeft: true, targetType: 'main', originMainId: sponsorMainId };
    }
    if (mainNode.rightChild === 0n) {
      return { parentId: sponsorMainId, isLeft: false, targetType: 'main', originMainId: sponsorMainId };
    }
  }

  // ขั้นตอนที่ 2: จับคู่โคลนตามรหัสหลักต้นสังกัด (originMainId === sponsorNodeId) เท่านั้น!
  const matchedClonesByOrigin: Array<{ id: bigint; leftChild: bigint; rightChild: bigint }> = [];

  for (const node of Object.values(rankNodes)) {
    if (!node.isClone) continue;
    const meta = lineageMap.get(node.id.toString());
    const nodeOrigin = meta?.originMainId || node.originMainId || '0';
    if (nodeOrigin === sponsorMainIdStr) {
      matchedClonesByOrigin.push({
        id: node.id,
        leftChild: node.leftChild,
        rightChild: node.rightChild,
      });
    }
  }

  matchedClonesByOrigin.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const clone of matchedClonesByOrigin) {
    if (clone.leftChild === 0n) {
      return { parentId: clone.id, isLeft: true, targetType: 'clone', originMainId: sponsorMainId };
    }
    if (clone.rightChild === 0n) {
      return { parentId: clone.id, isLeft: false, targetType: 'clone', originMainId: sponsorMainId };
    }
  }

  // ขั้นตอนที่ 3: หากรหัสหลักและโคลนในสังกัด (originMainId === sponsorNodeId) เต็มหมด ให้หาช่องว่าง BFS ใต้ sponsorMainId
  const slot = findFirstAvailableUnder(rankNodes, sponsorMainId);
  return { parentId: slot.parentId, isLeft: slot.isLeft, targetType: 'descendant', originMainId: sponsorMainId };
}

/**
 * ค้นหารหัสผู้แนะนำตรง (Sponsor Main Node ID) ของรหัสหลักนั้นๆ
 * เช่น #5 มีผู้แนะนำคือ #2 -> คืนค่า 2n เพื่อให้โคลนของ #5 ไปต่อ #2 หรือโคลนของ #2 (#6)
 */
export function resolveSponsorNodeIdForMainNode(
  rankNodes: RankNodesMap,
  lineageMap: Map<string, CloneLineageMeta>,
  originMainIdStr: string,
  sponsorAddress: string
): bigint {
  if (!originMainIdStr || originMainIdStr === '0' || originMainIdStr === '1') {
    return 1n;
  }

  const originNode = rankNodes[originMainIdStr];
  if (originNode?.directSponsorNodeId && originNode.directSponsorNodeId !== '0') {
    return BigInt(originNode.directSponsorNodeId);
  }

  const effectiveSponsorAddr = (
    originNode?.directSponsor && originNode.directSponsor !== ethers.ZeroAddress
      ? originNode.directSponsor
      : sponsorAddress || ''
  ).toLowerCase();

  if (!effectiveSponsorAddr || effectiveSponsorAddr === ethers.ZeroAddress) {
    return 1n;
  }

  const originNum = Number(originMainIdStr);

  // 1. ไล่สายอัพไลน์ (parentId) ของรหัสหลักขึ้นไป ถ้าเจอโหนดที่เป็นของกระเป๋าผู้แนะนำ ให้ใช้ originMainId ของโหนดนั้นทันที (เช่น #5 อยู่ขวาของ #2 -> ได้ #2)
  let currIdStr = originNode ? originNode.parentId.toString() : '0';
  const visited = new Set<string>();
  while (currIdStr && currIdStr !== '0' && !visited.has(currIdStr)) {
    visited.add(currIdStr);
    const anc = rankNodes[currIdStr];
    if (!anc) break;
    if ((anc.owner || '').toLowerCase() === effectiveSponsorAddr) {
      const ancMeta = lineageMap.get(currIdStr);
      const ancOriginStr = ancMeta ? ancMeta.originMainId : anc.originMainId || currIdStr;
      if (Number(ancOriginStr) < originNum) {
        return BigInt(ancOriginStr);
      }
    }
    currIdStr = anc.parentId.toString();
  }

  // 2. หากไม่อยู่ในสายอัพไลน์โดยตรง ให้หารหัสหลักแรกของกระเป๋าผู้แนะนำที่เกิดก่อน originMainId
  const candidateMains = Object.values(rankNodes)
    .filter(
      (n) =>
        !n.isClone &&
        (n.owner || '').toLowerCase() === effectiveSponsorAddr &&
        Number(n.id) < originNum
    )
    .sort((a, b) => Number(a.id - b.id));

  if (candidateMains.length > 0) {
    return candidateMains[0].id;
  }

  return 1n;
}

/**
 * เงื่อนไขการวางตำแหน่งสำหรับ โคลนนิ่ง (Clone ID - Rebirth เมื่อเกิดลูกขวา):
 * แยกฟังก์ชันออกจาก New Auto ID และ Auto Extra ID
 * โดยวางต่อผู้แนะนำตรงของรหัสหลักนั้น (targetSponsorNodeId เช่น #2) หรือโคลนนิ่งของผู้แนะนำตรงนั้น (#6)
 */
export function findClonePlacementSlot(
  rankNodes: RankNodesMap,
  sponsorAddress: string,
  targetSponsorNodeId: number | bigint
): { parentId: bigint; isLeft: boolean; targetType: 'main' | 'clone' | 'descendant'; targetNodeId: bigint } {
  return findDirectSponsorOrCloneSlot(rankNodes, sponsorAddress, targetSponsorNodeId);
}

// --- 3. ฟังก์ชันจำลองการเกิดรหัสโคลนนิ่งอัตโนมัติ (Recursive Right-Child Rebirth Clone) ---
function simulateRightChildCloneCascade(
  rankNodes: RankNodesMap,
  ownerProfiles: Record<string, OwnerProfileCache>,
  triggerParentId: bigint,
  state: { nextNodeId: bigint; currentToggle: number },
  spawnedList: SpawnedCloneStep[],
  depth = 0
) {
  if (depth > 16) return; // Safety guard
  const parentNode = rankNodes[triggerParentId.toString()];
  if (!parentNode) return;

  const lineageMap = buildCloneLineageMap(rankNodes);
  const triggerMeta = lineageMap.get(triggerParentId.toString());
  const cloneOriginMainIdStr = triggerMeta
    ? triggerMeta.originMainId
    : parentNode.originMainId || triggerParentId.toString();

  const parentOwner = parentNode.owner;
  const parentOwnerKey = parentOwner.toLowerCase();
  const parentProfile = ownerProfiles[parentOwnerKey];

  let parentSponsor =
    parentNode.directSponsor && parentNode.directSponsor !== ethers.ZeroAddress
      ? parentNode.directSponsor
      : parentProfile?.sponsor && parentProfile.sponsor !== ethers.ZeroAddress
      ? parentProfile.sponsor
      : parentOwner;

  if (!parentSponsor || parentSponsor === ethers.ZeroAddress) {
    parentSponsor = parentOwner;
  }

  // แยกรหัสหลักของโคลน (cloneOriginMainIdStr เช่น #5) ออกจากรหัสผู้แนะนำของรหัสหลักนั้น (targetSponsorNodeId เช่น #2)
  // เพื่อให้โคลนนิ่งของ #5 วิ่งไปต่อ #2 หรือโคลนนิ่งของ #2 (#6) ตามผู้แนะนำที่แท้จริง!
  const targetSponsorNodeId = resolveSponsorNodeIdForMainNode(
    rankNodes,
    lineageMap,
    cloneOriginMainIdStr,
    parentSponsor
  );

  const clonePlacement = findClonePlacementSlot(
    rankNodes,
    parentSponsor,
    targetSponsorNodeId
  );

  state.nextNodeId += 1n;
  const cloneNodeId = state.nextNodeId;
  const cloneKey = cloneNodeId.toString();

  rankNodes[cloneKey] = {
    id: cloneNodeId,
    owner: parentOwner,
    directSponsor: parentSponsor,
    parentId: clonePlacement.parentId,
    leftChild: 0n,
    rightChild: 0n,
    isClone: true,
    originMainId: cloneOriginMainIdStr,
    directSponsorNodeId: targetSponsorNodeId.toString(),
  };

  const targetParentNode = rankNodes[clonePlacement.parentId.toString()];
  if (targetParentNode) {
    if (clonePlacement.isLeft) {
      targetParentNode.leftChild = cloneNodeId;
    } else {
      targetParentNode.rightChild = cloneNodeId;
    }
  }

  if (!ownerProfiles[parentOwnerKey]) {
    ownerProfiles[parentOwnerKey] = {
      sponsor: parentSponsor,
      firstNodeId: triggerParentId,
      latestNodeId: cloneNodeId,
    };
  } else {
    ownerProfiles[parentOwnerKey].latestNodeId = cloneNodeId;
  }

  spawnedList.push({
    cloneNodeId: cloneKey,
    cloneOwner: parentOwner,
    triggeredByParentId: triggerParentId.toString(),
    cloneParentId: clonePlacement.parentId.toString(),
    cloneIsLeft: clonePlacement.isLeft,
  });

  // If the clone itself landed on a RIGHT child slot, Solidity recursively triggers another clone!
  if (!clonePlacement.isLeft) {
    simulateRightChildCloneCascade(
      rankNodes,
      ownerProfiles,
      clonePlacement.parentId,
      state,
      spawnedList,
      depth + 1
    );
  }
}

// --- 4. โหลดข้อมูลผังไบนารี่จริงจาก Database ของเราเป็นหลัก (Database-First + On-Chain Fallback) ---
export async function loadOnChainRank1State(
  providerOrSigner: ethers.Provider | ethers.Signer | null,
  contractAddress: string = CONTRACT_ADDRESS,
  sponsorNodeId: number = 1
): Promise<{
  rankNodes: RankNodesMap;
  ownerProfiles: Record<string, OwnerProfileCache>;
  totalNodes: bigint;
  roundToggle: number;
  sponsorIsValid: boolean;
  sponsorReason: string;
  sponsorAddress: string;
}> {
  const rankNodes: RankNodesMap = {};
  const uniqueOwners = new Set<string>();
  let totalNodes = 1n;
  let roundToggle = 0;
  let sponsorIsValid = true;
  let sponsorReason = 'Valid main sponsor ID';
  let sponsorAddress = ethers.ZeroAddress;
  let loadedFromDatabase = false;

  // 1. อ่านข้อมูลโหนดทั้งหมดและตรวจสอบผู้แนะนำจาก Database ของเราก่อนเป็นอันดับแรก (เร็วและไม่ต้องยิง RPC หลายรอบ)
  try {
    const [treeRes, sponsorRes] = await Promise.all([
      fetch(`/api/matrix/tree-nodes?rank=1&contract=${contractAddress}`, {
        headers: { Accept: 'application/json' },
      }),
      fetch(`/api/matrix/sponsor-check?nodeId=${sponsorNodeId}&contract=${contractAddress}`, {
        headers: { Accept: 'application/json' },
      }),
    ]);

    if (treeRes.ok) {
      const treeJson = await treeRes.json();
      if (treeJson && treeJson.success && Array.isArray(treeJson.nodes) && treeJson.nodes.length > 0) {
        for (const n of treeJson.nodes) {
          const idBn = BigInt(n.id || 0);
          if (idBn === 0n) continue;
          const ownerStr = String(n.owner || ethers.ZeroAddress);
          rankNodes[idBn.toString()] = {
            id: idBn,
            owner: ownerStr,
            directSponsor: String(n.directSponsor || ethers.ZeroAddress),
            parentId: BigInt(n.parentId || 0),
            leftChild: BigInt(n.leftChild || 0),
            rightChild: BigInt(n.rightChild || 0),
            isClone: Boolean(n.isClone),
          };
          if (ownerStr && ownerStr !== ethers.ZeroAddress) {
            uniqueOwners.add(ownerStr.toLowerCase());
          }
        }
        totalNodes = BigInt(treeJson.totalNodes || treeJson.nodes.length);
        loadedFromDatabase = Object.keys(rankNodes).length > 0;
      }
    }

    if (sponsorRes.ok) {
      const sponsorJson = await sponsorRes.json();
      if (sponsorJson && sponsorJson.success) {
        sponsorIsValid = Boolean(sponsorJson.isValid);
        sponsorReason = String(sponsorJson.reason || 'Valid main sponsor ID');
        sponsorAddress = String(sponsorJson.sponsorAddress || ethers.ZeroAddress);
      }
    }
  } catch {
    // Fallback to direct RPC below if Database API is unreachable
  }

  // 2. Fallback ไปยัง RPC เฉพาะกรณีที่ Database ยังไม่พร้อม
  if (!loadedFromDatabase) {
    try {
      const provider = await getWorkingReadProvider(providerOrSigner);
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);

      const [onChainTotal, onChainToggle, sponsorInfo] = await Promise.all([
        contract.totalNodesInRank(1).catch(() => 1n),
        contract
          .sponsorRoundToggle(1, sponsorNodeId)
          .catch(() => contract.placementRoundToggle(1).catch(() => 0)),
        contract
          .checkValidSponsorId(sponsorNodeId)
          .catch(() => [true, 'Valid main sponsor ID', ethers.ZeroAddress]),
      ]);

      totalNodes = BigInt(onChainTotal || 1n);
      roundToggle = Number(onChainToggle || 0);
      sponsorIsValid = Boolean(sponsorInfo?.isValid ?? sponsorInfo?.[0] ?? true);
      sponsorReason = String(sponsorInfo?.reason ?? sponsorInfo?.[1] ?? 'Valid main sponsor ID');
      sponsorAddress = String(
        sponsorInfo?.sponsorAddress ?? sponsorInfo?.[2] ?? ethers.ZeroAddress
      );

      const count = Number(totalNodes);
      const ids = Array.from({ length: count }, (_, idx) => idx + 1);

      const rawNodesList = await Promise.all(
        ids.map(async (id) => {
          try {
            const n = await contract.rankNodes(1, id);
            return {
              id: BigInt(n.id ?? n[0]),
              owner: String(n.owner ?? n[1]),
              directSponsor: String(n.directSponsor ?? n[2]),
              parentId: BigInt(n.parentId ?? n[3]),
              leftChild: BigInt(n.leftChild ?? n[4]),
              rightChild: BigInt(n.rightChild ?? n[5]),
              isClone: Boolean(n.isClone ?? n[6]),
            };
          } catch {
            return null;
          }
        })
      );

      for (const item of rawNodesList) {
        if (!item || item.id === 0n) continue;
        rankNodes[item.id.toString()] = item;
        if (item.owner && item.owner !== ethers.ZeroAddress) {
          uniqueOwners.add(item.owner.toLowerCase());
        }
      }
    } catch {
      // Ignore RPC fallback error
    }
  }

  if (
    (!sponsorAddress || sponsorAddress === ethers.ZeroAddress) &&
    rankNodes[String(sponsorNodeId)]
  ) {
    const targetSponsorNode = rankNodes[String(sponsorNodeId)];
    sponsorAddress = targetSponsorNode.owner;
    sponsorIsValid = !targetSponsorNode.isClone;
    sponsorReason = sponsorIsValid
      ? 'Valid main sponsor ID'
      : 'Special nodes cannot be used as a sponsor';
  }

  if (sponsorAddress && sponsorAddress !== ethers.ZeroAddress) {
    uniqueOwners.add(sponsorAddress.toLowerCase());
  }

  // สร้าง ownerProfiles จากข้อมูลโหนดใน Database ทันทีโดยไม่ต้องยิง getUserProfile ซ้ำทุกกระเป๋า
  const ownerProfiles: Record<string, OwnerProfileCache> = {};
  const sortedNodeIds = Object.keys(rankNodes)
    .map((k) => Number(k))
    .sort((a, b) => a - b);

  for (const numId of sortedNodeIds) {
    const node = rankNodes[String(numId)];
    if (!node || !node.owner) continue;
    const ownerKey = node.owner.toLowerCase();
    if (!ownerProfiles[ownerKey]) {
      ownerProfiles[ownerKey] = {
        sponsor: node.directSponsor,
        firstNodeId: node.id,
        latestNodeId: node.id,
      };
    } else if (node.isClone) {
      ownerProfiles[ownerKey].latestNodeId = node.id;
    }
  }

  // OVERLAY ACTIVE FIFO QUEUE RESERVATIONS (RACE CONDITION PROTECTION)
  try {
    const queueRes = await fetch('/api/queue/status');
    if (queueRes.ok) {
      const queueData = await queueRes.json();
      if (queueData.activeReservations && Array.isArray(queueData.activeReservations)) {
        const now = Date.now();
        for (const res of queueData.activeReservations) {
          if (res.status === 'RESERVED' && now <= res.expiresAt) {
            for (const item of res.batchDetails) {
              const pKey = String(item.targetParentId);
              if (rankNodes[pKey]) {
                if (item.isLeft) {
                  rankNodes[pKey].leftChild = BigInt(item.assignedNodeId);
                } else {
                  rankNodes[pKey].rightChild = BigInt(item.assignedNodeId);
                }
              }
              rankNodes[String(item.assignedNodeId)] = {
                id: BigInt(item.assignedNodeId),
                owner: item.owner,
                directSponsor: res.sponsorAddress,
                parentId: BigInt(item.targetParentId),
                leftChild: 0n,
                rightChild: 0n,
                isClone: Boolean(item.isClone),
              };
            }
          }
        }
      }
    }
  } catch {
    // Ignore queue fetch error in offline/disconnected environments
  }

  return {
    rankNodes,
    ownerProfiles,
    totalNodes,
    roundToggle,
    sponsorIsValid,
    sponsorReason,
    sponsorAddress,
  };
}

// --- 5. ฟังก์ชันค้นหาตำแหน่งที่จะลงออโต้ (Auto-Placement Preview สำหรับแสดงบน UI แบบ Real-Time) ---
export async function previewOffChainSimulation(
  providerOrSigner: ethers.Provider | ethers.Signer | null,
  contractAddress: string,
  sponsorNodeId: number,
  applicantsQueue: ApplicantItem[],
  onProgress: (msg: string) => void = () => {},
  mode: PlacementMode = 'contract_round'
) {
  let rankNodes: RankNodesMap = {};
  let ownerProfiles: Record<string, OwnerProfileCache> = {};
  let totalNodes = 1n;
  let roundToggle = 0;
  let sponsorIsValid = true;
  let sponsorReason = 'Valid main sponsor ID';
  let sponsorAddress = CONTRACT_ADDRESS;

  try {
    onProgress('กำลังค้นหาตำแหน่งว่างในผังไบนารี่แบบออโต้ (Auto-Placement Sync)...');
    const loaded = await loadOnChainRank1State(providerOrSigner, contractAddress, sponsorNodeId);
    rankNodes = loaded.rankNodes;
    ownerProfiles = loaded.ownerProfiles;
    totalNodes = loaded.totalNodes;
    roundToggle = loaded.roundToggle;
    sponsorIsValid = loaded.sponsorIsValid;
    sponsorReason = loaded.sponsorReason;
    sponsorAddress = loaded.sponsorAddress;
  } catch {
    onProgress('ใช้โครงสร้างจำลองเริ่มต้น (Fallback Memory State)...');
  }

  if (Object.keys(rankNodes).length === 0) {
    rankNodes['1'] = {
      id: 1n,
      owner: sponsorAddress,
      directSponsor: ethers.ZeroAddress,
      parentId: 0n,
      leftChild: 0n,
      rightChild: 0n,
      isClone: false,
    };
    totalNodes = 1n;
  }

  // Snapshot all real on-chain Rank 1 nodes with Clone Lineage metadata before in-memory simulation
  const initialLineageMap = buildCloneLineageMap(rankNodes);
  const onChainNodesList: WalletNodeDetail[] = Object.values(rankNodes)
    .sort((a, b) => Number(a.id - b.id))
    .map((n) => {
      const idStr = n.id.toString();
      const meta = initialLineageMap.get(idStr);
      return {
        id: idStr,
        owner: n.owner,
        directSponsor: n.directSponsor,
        parentId: n.parentId.toString(),
        leftChild: n.leftChild.toString(),
        rightChild: n.rightChild.toString(),
        isClone: n.isClone,
        originMainId: meta?.originMainId || idStr,
        spawnedFromNodeId: meta?.spawnedFromNodeId || '0',
        cloneRound: meta?.cloneRound || 0,
        subCloneDepth: meta?.subCloneDepth || 0,
      };
    });

  const sponsorNodeDetail: WalletNodeDetail | null =
    onChainNodesList.find((n) => n.id === String(sponsorNodeId)) || null;

  const effectiveSponsorWallet = (
    sponsorNodeDetail?.owner ||
    sponsorAddress ||
    ''
  ).toLowerCase();

  const sponsorOwnedNodes: WalletNodeDetail[] = effectiveSponsorWallet
    ? onChainNodesList.filter((n) => n.owner.toLowerCase() === effectiveSponsorWallet)
    : [];

  const targetParentIds: bigint[] = [];
  const isLefts: boolean[] = [];
  const isClones: boolean[] = [];
  const stepLogs: SimulationStepLog[] = [];

  const simState = {
    nextNodeId: totalNodes,
    currentToggle: Number(roundToggle),
  };

  const count = Math.max(1, applicantsQueue.length);

  for (let i = 0; i < count; i++) {
    const applicant = applicantsQueue[i] || { owner: ethers.ZeroAddress };
    const usedRound = simState.currentToggle;

    let placement: { parentId: bigint; isLeft: boolean };

    if (mode === 'global_bfs') {
      // ค้นหาตำแหน่งว่างแบบออโต้จากชั้นบนสุดของผังรวม (#1)
      placement = findFirstAvailableUnder(rankNodes, 1n);
    } else if (mode === 'auto_under_sponsor') {
      placement = findFirstAvailableUnder(rankNodes, BigInt(sponsorNodeId || 1));
    } else {
      // เงื่อนไขสมัครสมาชิก: จะต้องไปต่อติดตัวของผู้แนะนำตรง Direct Sponsor ซ้ายก่อนขวา
      // แต่ถ้าผู้แนะนำตรง Direct Sponsor ไม่มีช่องว่าง ก็ให้ไปวางต่อติดตัวโคลนนิ่ง Direct Sponsor เท่านั้น
      const directOrClone = findDirectSponsorOrCloneSlot(
        rankNodes,
        sponsorAddress,
        BigInt(sponsorNodeId || 1)
      );
      placement = { parentId: directOrClone.parentId, isLeft: directOrClone.isLeft };
    }

    targetParentIds.push(placement.parentId);
    isLefts.push(placement.isLeft);
    isClones.push(false);

    simState.nextNodeId += 1n;
    const assignedNodeId = simState.nextNodeId;
    const newIdStr = assignedNodeId.toString();

    rankNodes[newIdStr] = {
      id: assignedNodeId,
      owner: applicant.owner,
      directSponsor: sponsorAddress,
      parentId: placement.parentId,
      leftChild: 0n,
      rightChild: 0n,
      isClone: false,
      originMainId: newIdStr,
      directSponsorNodeId: String(sponsorNodeId || 1),
    };

    const applicantKey = (applicant.owner || '').toLowerCase();
    if (applicantKey) {
      if (!ownerProfiles[applicantKey]) {
        ownerProfiles[applicantKey] = {
          sponsor: sponsorAddress,
          firstNodeId: assignedNodeId,
          latestNodeId: assignedNodeId,
        };
      } else {
        ownerProfiles[applicantKey].latestNodeId = assignedNodeId;
      }
    }

    const spawnedClones: SpawnedCloneStep[] = [];

    if (placement.isLeft) {
      rankNodes[placement.parentId.toString()].leftChild = assignedNodeId;
    } else {
      rankNodes[placement.parentId.toString()].rightChild = assignedNodeId;

      // จำลองการเกิดรหัสโคลนนิ่งอัตโนมัติบน Smart Contract เมื่อลงฝั่งขวา (รวมกรณีเกิดโคลนซ้อนต่อเนื่อง)
      simulateRightChildCloneCascade(
        rankNodes,
        ownerProfiles,
        placement.parentId,
        simState,
        spawnedClones,
        0
      );
    }

    stepLogs.push({
      applicantIndex: i + 1,
      owner: applicant.owner,
      assignedNodeId: newIdStr,
      targetParentId: placement.parentId.toString(),
      isLeft: placement.isLeft,
      roundToggleUsed: usedRound,
      spawnedClone: spawnedClones[0]
        ? {
            cloneNodeId: spawnedClones[0].cloneNodeId,
            cloneOwner: spawnedClones[0].cloneOwner,
            cloneParentId: spawnedClones[0].cloneParentId,
            cloneIsLeft: spawnedClones[0].cloneIsLeft,
          }
        : undefined,
      spawnedClones,
    });
  }

  return {
    sponsorIsValid,
    sponsorReason,
    sponsorAddress: sponsorNodeDetail?.owner || sponsorAddress,
    roundToggle,
    totalNodesBefore: Number(totalNodes),
    targetParentIds: targetParentIds.map((id) => id.toString()),
    targetParentIdsBigInt: targetParentIds,
    isLefts,
    isClones,
    stepLogs,
    finalNodesCount: Number(simState.nextNodeId),
    onChainNodesList,
    sponsorNodeDetail,
    sponsorOwnedNodes,
  };
}

// --- 6. ฟังก์ชันหลักสำหรับคำนวณตำแหน่งออโต้และส่งธุรกรรมลง Smart Contract ---
export async function executeOffChainSimulationAndBatch(
  signer: ethers.Signer,
  contractAddress: string,
  sponsorNodeId: number,
  applicantsQueue: ApplicantItem[],
  onProgress: (msg: string) => void = () => {},
  mode: PlacementMode = 'contract_round'
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
  targetParentIds?: string[];
  isLefts?: boolean[];
  isClones?: boolean[];
  stepLogs?: SimulationStepLog[];
}> {
  try {
    const userAddress = await signer.getAddress();
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

    onProgress(`กำลังค้นหาตำแหน่งว่างออโต้ใต้ Sponsor #${sponsorNodeId}...`);
    const simResult = await previewOffChainSimulation(
      signer,
      contractAddress,
      sponsorNodeId,
      applicantsQueue,
      onProgress,
      mode
    );

    if (!simResult.sponsorIsValid) {
      throw new Error(`รหัสผู้แนะนำ #${sponsorNodeId} ไม่ถูกต้อง: ${simResult.sponsorReason}`);
    }

    const count = applicantsQueue.length;
    if (count === 0) throw new Error('จำนวนโหนดที่สมัครต้องมากกว่า 0');

    let rankPrice: bigint;
    try {
      rankPrice = await contract.rankPrice(1);
    } catch {
      rankPrice = ethers.parseUnits('5', 18);
    }

    let usdtAddress: string = USDT_ADDRESS;
    try {
      usdtAddress = await contract.usdt();
    } catch {
      usdtAddress = USDT_ADDRESS;
    }

    const totalCost = rankPrice * BigInt(count);

    onProgress('กำลังตรวจสอบยอด USDT และวงเงินอนุมัติ (Allowance)...');
    const usdtContract = new ethers.Contract(
      usdtAddress,
      [
        'function balanceOf(address account) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function decimals() view returns (uint8)',
      ],
      signer
    );

    let usdtDecimals = 18;
    try {
      usdtDecimals = Number(await usdtContract.decimals());
    } catch {
      usdtDecimals = 18;
    }

    const usdtBalance: bigint = await usdtContract.balanceOf(userAddress);
    if (usdtBalance < totalCost) {
      throw new Error(
        `ยอดเหรียญ USDT ไม่เพียงพอ! คุณมี ${Number(
          ethers.formatUnits(usdtBalance, usdtDecimals)
        ).toFixed(2)} USDT แต่ต้องใช้ ${Number(
          ethers.formatUnits(totalCost, usdtDecimals)
        ).toFixed(2)} USDT`
      );
    }

    const currentAllowance: bigint = await usdtContract.allowance(userAddress, contractAddress);
    if (currentAllowance < totalCost) {
      onProgress('ขั้นตอนที่ 1/2: กรุณากดยืนยัน (Approve USDT) ในกระเป๋า MetaMask...');
      const approveTx = await usdtContract.approve(contractAddress, totalCost * 10n, {
        gasLimit: 100000n,
      });
      onProgress('กำลังรอการยืนยัน Approve USDT บนบล็อกเชน...');
      await approveTx.wait();
    }

    // รีเฟรชการคำนวณตำแหน่งจากสถานะเชนล่าสุดอีกครั้งก่อนส่งธุรกรรม เพื่อให้มั่นใจว่าตรงกับรหัสหลักของผู้แนะนำ (#sponsorNodeId)
    if (mode === 'contract_round') {
      try {
        onProgress(
          `ถึงคิวส่งแล้ว! กำลังตรวจสอบตำแหน่งสายตรงและโคลนนิ่งของ Sponsor #${sponsorNodeId} ล่าสุด...`
        );
        const latestSim = await previewOffChainSimulation(
          signer,
          contractAddress,
          sponsorNodeId,
          applicantsQueue,
          undefined,
          mode
        );
        if (latestSim.targetParentIds.length === count) {
          simResult.targetParentIds = latestSim.targetParentIds;
          simResult.targetParentIdsBigInt = latestSim.targetParentIdsBigInt;
          simResult.isLefts = latestSim.isLefts;
          simResult.stepLogs = latestSim.stepLogs;
        }
      } catch (cpErr) {
        console.warn('Notice re-verifying placement before sending batch:', cpErr);
      }
    }

    const firstParent = simResult.targetParentIds[0];
    const firstSide = simResult.isLefts[0] ? 'LEFT ลูกซ้าย' : 'RIGHT ลูกขวา';
    onProgress(
      `ขั้นตอนที่ 2/2: กำลังส่งธุรกรรมลงตำแหน่งออโต้ Parent #${firstParent} (${firstSide})... กรุณายืนยันใน MetaMask`
    );

    const tx = await contract.registerBatch(
      BigInt(sponsorNodeId),
      BigInt(count),
      simResult.targetParentIdsBigInt,
      simResult.isLefts,
      simResult.isClones
    );

    onProgress('ส่งธุรกรรมสำเร็จ กำลังรอการยืนยันจากบล็อกเชน BNB Testnet...');
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
      targetParentIds: simResult.targetParentIds,
      isLefts: simResult.isLefts,
      isClones: simResult.isClones,
      stepLogs: simResult.stepLogs,
    };
  } catch (error: any) {
    console.error('Auto-Placement & Batch Registration Error:', error);
    return {
      success: false,
      error: error?.reason || error?.shortMessage || error?.message || 'เกิดข้อผิดพลาดในการสมัคร',
    };
  }
}
