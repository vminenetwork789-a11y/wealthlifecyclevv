/**
 * Utility for calculating the 3 Vault Pools strictly scoped to a specific Main ID (Idหลักนั้นๆ):
 * 
 * คำนิยามคำว่าไอดีหลัก:
 * หลักการสำคัญ: ระบบคำนวณแยกตาม "Idหลักนั้นๆ" โดยเฉพาะ ไม่ใช่ยอดรวมทั้งกระเป๋า
 * เนื่องจาก 1 กระเป๋าเงินสามารถถือครองได้หลายรหัสหลัก (ทั้งจากการสมัครตรง และจาก Auto New Main ID)
 *
 * คำนิยาม 5 rank ย้อนหลัง:
 * สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank [Math.max(1, currentRank - 4) ... currentRank]
 * ยกตัวอย่าง ถ้าสถานะไอดี #6 อยู่ rank 6 ก็ให้รวมยอด Vault (35%) rank 2-6
 * 
 * 1. Upgrade Rank Pool:
 *    สูตร: ยอดสะสม Vault (35%) ของ 5 rank ย้อนหลัง
 *    คำนิยาม 5 rank ย้อนหลัง: สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank [Math.max(1, currentRank - 4) ... currentRank]
 *    การใช้งาน: ยอดสะสมในกรอบ 5 rank ย้อนหลังนี้จะถูกนำมาใช้ปลดล็อกอัปเกรดสู่แรงค์ถัดไปโดยอัตโนมัติ
 * 
 * 2. New Auto ID Pool:
 *    สูตร: ยอดสะสม Vault (35%) ใน Rank 1 ถึง 3 ลบด้วย 5 rank ย้อนหลังของรหัสหลักนั้น
 *    คำนิยาม 5 rank ย้อนหลัง: สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank
 *    การปลดล็อก: เมื่อสะสมครบ 5.00 USDT ปลดล็อกสิทธิ์สร้าง Auto New Main ID ใหม่ทันที (เงินแยก ไม่ใช้เหรียญในกระเป๋า)
 * 
 * 3. New Extra ID Pool:
 *    สูตร: 
 *    - สถานะ rank ปัจจุบันของ idหลักนั้น ต่ำกว่า 27:
 *      ยอดสะสม Vault (35%) ใน Rank 4 ถึง 27 ลบด้วย 5 rank ย้อนหลังของรหัสหลักนั้น
 *    - สถานะ rank ปัจจุบันของ idหลักนั้น เท่ากับ 27:
 *      ยอดสะสม Vault (35%) ใน Rank 4 ถึง 27
 *    คำนิยาม 5 rank ย้อนหลัง: สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank
 *    การเกิด: สะสมครบตาม ราคา Rank เป้าหมาย ปลดล็อกสร้าง Auto Extra ID ใน Rank 2-27
 */

export interface MainIdVaultBreakdown {
  mainId: number;
  currentRank: number;
  window5Start: number;
  window5End: number;
  window5Ranks: number[];
  upgradeRankPool: number;
  newAutoIdPool: number;
  newExtraIdPool: number;
  vaultByRank: Record<number, number>;
  totalAccumulatedVault: number;
  windowDescriptionTh: string;
  autoIdPoolDescriptionTh: string;
  extraIdPoolDescriptionTh: string;
}

export function calculateMainIdVaultPools(
  mainId: number,
  currentRank: number,
  vaultByRank: Record<number, number> = {}
): MainIdVaultBreakdown {
  const safeRank = Math.max(1, Math.min(27, currentRank || 1));
  const window5Start = Math.max(1, safeRank - 4);
  const window5End = safeRank;

  const window5Ranks: number[] = [];
  for (let r = window5Start; r <= window5End; r++) {
    window5Ranks.push(r);
  }

  // 1. Upgrade Rank Pool: ยอดสะสม Vault (35%) ของ 5 rank ย้อนหลัง
  // (สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank)
  let upgradeRankPool = 0;
  for (const r of window5Ranks) {
    upgradeRankPool += Number(vaultByRank[r] || 0);
  }

  // 2. New Auto ID Pool: ยอดสะสม Vault (35%) ใน Rank 1 ถึง 3 ลบด้วย 5 rank ย้อนหลังของรหัสหลักนั้น
  // (เฉพาะ Rank 1..3 ที่หลุดพ้นจาก 5 rank ย้อนหลัง i.e. r < window5Start)
  let newAutoIdPool = 0;
  for (let r = 1; r <= 3; r++) {
    if (r < window5Start) {
      newAutoIdPool += Number(vaultByRank[r] || 0);
    }
  }

  // 3. New Extra ID Pool:
  // - สถานะ rank ปัจจุบันของ idหลักนั้น ต่ำกว่า 27:
  //   ยอดสะสม Vault (35%) ใน Rank 4 ถึง 27 ลบด้วย 5 rank ย้อนหลังของรหัสหลักนั้น (r in 4..27 && r < window5Start)
  // - สถานะ rank ปัจจุบันของ idหลักนั้น เท่ากับ 27:
  //   ยอดสะสม Vault (35%) ใน Rank 4 ถึง 27 ทั้งหมด
  let newExtraIdPool = 0;
  if (safeRank === 27) {
    for (let r = 4; r <= 27; r++) {
      newExtraIdPool += Number(vaultByRank[r] || 0);
    }
  } else {
    for (let r = 4; r <= 27; r++) {
      if (r < window5Start) {
        newExtraIdPool += Number(vaultByRank[r] || 0);
      }
    }
  }

  let totalAccumulatedVault = 0;
  for (let r = 1; r <= 27; r++) {
    totalAccumulatedVault += Number(vaultByRank[r] || 0);
  }

  const windowDescriptionTh =
    window5Start === window5End
      ? `Rank ${window5Start}`
      : `Rank ${window5Start} - Rank ${window5End}`;

  const autoIdPoolDescriptionTh =
    window5Start <= 1
      ? 'ทุก Rank 1-3 อยู่ใน 5 rank ย้อนหลัง (ยังไม่มียอดที่หลุดกรอบ)'
      : window5Start >= 4
      ? 'Rank 1-3 ทั้งหมดหลุดจาก 5 rank ย้อนหลังแล้ว (สะสมเต็มจำนวน)'
      : `Rank 1 ถึง Rank ${window5Start - 1} ที่หลุดจาก 5 rank ย้อนหลัง`;

  const extraIdPoolDescriptionTh =
    safeRank === 27
      ? 'สถานะ Rank 27: รวมยอดสะสม Vault ทั้งหมดใน Rank 4 ถึง 27'
      : window5Start <= 4
      ? 'ยังไม่มี Rank 4-27 ที่หลุดจาก 5 rank ย้อนหลัง'
      : `Rank 4 ถึง Rank ${window5Start - 1} ที่หลุดจาก 5 rank ย้อนหลัง`;

  return {
    mainId,
    currentRank: safeRank,
    window5Start,
    window5End,
    window5Ranks,
    upgradeRankPool: Number(upgradeRankPool.toFixed(4)),
    newAutoIdPool: Number(newAutoIdPool.toFixed(4)),
    newExtraIdPool: Number(newExtraIdPool.toFixed(4)),
    vaultByRank,
    totalAccumulatedVault: Number(totalAccumulatedVault.toFixed(4)),
    windowDescriptionTh,
    autoIdPoolDescriptionTh,
    extraIdPoolDescriptionTh,
  };
}
