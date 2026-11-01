import React, { useState, useMemo } from 'react';
import {
  HelpCircle,
  ChevronDown,
  Search,
  Layers,
  TrendingUp,
  FileCode2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  GitFork,
  Coins,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface FAQSectionProps {
  language: 'th' | 'en';
  contractAddress?: string;
  usdtAddress?: string;
}

interface FAQItem {
  id: string;
  category: 'matrix' | 'ranks' | 'contracts' | 'troubleshooting';
  questionTh: string;
  questionEn: string;
  answerTh: React.ReactNode;
  answerEn: React.ReactNode;
  tagsTh: string[];
  tagsEn: string[];
}

export const FAQSection: React.FC<FAQSectionProps> = ({
  language,
  contractAddress = '0x1700326ce4d4507A5DD88EB50156758581B6F4cB',
  usdtAddress = '0x05f24E1F598DF1aE8d0B424ce978f8ea33bB752b',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    'v7-overview': true,
    'clone-rules': true,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    const allOpen: Record<string, boolean> = {};
    faqData.forEach((item) => {
      allOpen[item.id] = true;
    });
    setOpenItems(allOpen);
  };

  const handleCollapseAll = () => {
    setOpenItems({});
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const faqData: FAQItem[] = useMemo(
    () => [
      {
        id: 'v7-overview',
        category: 'matrix',
        questionTh: 'ผังไบนารี่ V7 (Fractal Flow Matrix 27) มีโครงสร้างและการทำงานอย่างไร?',
        questionEn: 'How does the V7 Binary Matrix (Fractal Flow Matrix 27) work?',
        tagsTh: ['ผังไบนารี่', 'โครงสร้าง', '15 ชั้น', 'V7'],
        tagsEn: ['Binary Matrix', 'Structure', '15 Levels', 'V7'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              ระบบผังไบนารี่ V7 เป็นระบบกระจายเครือข่ายแบบต้นไม้ 2 สายงาน (Binary Tree: ซ้าย และ ขวา) 
              โดยแต่ละรหัส (Node) สามารถมีลูกติดตัวได้สูงสุด 2 รหัส และมีความลึกสูงสุดถึง 15 ชั้น (15 Levels)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-emerald-500/20">
                <span className="font-semibold text-emerald-400 block mb-1">🌿 ขารหัสซ้าย (Left Child)</span>
                <p className="text-xs text-slate-300">
                  ทำหน้าที่กระจายรายได้และผลประโยชน์รวม 100%: แบ่งเป็นค่าแนะนำตรง (30%), โบนัสชั้นลึก 15 ชั้น (30%), 
                  เข้ากระปุกอัปเกรด Upgrade Vault (35%), กองทุนระบบ (4%), และค่าบริการบอท (1%)
                </p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-purple-500/20">
                <span className="font-semibold text-purple-400 block mb-1">⚡ ขารหัสขวา (Right Child)</span>
                <p className="text-xs text-slate-300">
                  ทำหน้าที่กระตุ้นระบบ <span className="text-purple-300 font-medium">100% Rebirth Trigger</span> 
                  โดยเงิน 100% จากตำแหน่งนี้จะถูกนำไปสร้างรหัสโคลนนิ่ง (Clone ID) ใหม่ให้เจ้าของรหัสทันที
                </p>
              </div>
            </div>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              The V7 Matrix is an automated 2-leg binary tree structure (Left & Right legs). 
              Each node can host up to 2 direct child nodes, expanding up to 15 levels of depth.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-emerald-500/20">
                <span className="font-semibold text-emerald-400 block mb-1">🌿 Left Child Node</span>
                <p className="text-xs text-slate-300">
                  Distributes 100% rewards: 30% Direct Sponsor Bonus, 30% 15-tier pass-up level bonuses (2%/tier), 
                  35% Upgrade Vault reserve, 4% System reserve, and 1% Bot fee.
                </p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-purple-500/20">
                <span className="font-semibold text-purple-400 block mb-1">⚡ Right Child Node</span>
                <p className="text-xs text-slate-300">
                  Activates the <span className="text-purple-300 font-medium">100% Rebirth Trigger</span>, 
                  re-investing 100% of the slot fee into spawning a fresh automated Clone ID for the node owner.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'clone-rules',
        category: 'matrix',
        questionTh: 'กฎการวางตำแหน่งโคลนนิ่งรอบที่ 1 และรอบที่ 2 แตกต่างกันอย่างไร?',
        questionEn: 'What is the difference between Clone Placement Round 1 and Round 2?',
        tagsTh: ['โคลนนิ่ง', 'รอบ 1', 'รอบ 2', 'BFS', 'Global'],
        tagsEn: ['Cloning', 'Round 1', 'Round 2', 'BFS', 'Global'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              ระบบรองรับการโคลนนิ่ง 2 รูปแบบเพื่อให้เครือข่ายไหลเวียนและช่วยเหลือสมาชิกทุกคนอย่างเป็นธรรม:
            </p>
            <ul className="space-y-2 text-xs">
              <li className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-lg border border-cyan-500/20">
                <span className="text-cyan-400 font-bold shrink-0 mt-0.5">• รอบที่ 1 (Direct Sponsor Lineage):</span>
                <span>
                  จะต่อติดตัวผู้แนะนำตรง (Direct Sponsor) และค้นหาช่องว่างในผังสายงานของผู้แนะนำเดียวกัน 
                  โดยไล่จากชั้นบนลงล่างและจากซ้ายไปขวา
                </span>
              </li>
              <li className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-lg border border-amber-500/20">
                <span className="text-amber-400 font-bold shrink-0 mt-0.5">• รอบที่ 2 (Global BFS Level Order):</span>
                <span>
                  สามารถ <strong className="text-amber-300">ไปต่อใครก็ได้ทั่วทั้งผังโดยไม่สนใจเงื่อนไขสายงาน</strong> 
                  โดยอัลกอริทึมจะสแกนหาตำแหน่งว่างใน <strong className="text-white">ชั้นที่ตื้นที่สุดจากบนลงล่าง เรียงจากซ้ายไปขวา</strong> 
                  ทันที เพื่อช่วยอุดช่องว่างของโครงสร้างทั้งระบบ ไม่ให้เกิดจุดตัน
                </span>
              </li>
            </ul>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              The contract implements two distinct placement algorithms to optimize both direct sponsor lineage and overall network health:
            </p>
            <ul className="space-y-2 text-xs">
              <li className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-lg border border-cyan-500/20">
                <span className="text-cyan-400 font-bold shrink-0 mt-0.5">• Round 1 (Direct Sponsor Lineage):</span>
                <span>
                  Placed strictly under the direct sponsor&apos;s team sub-tree, locating the shallowest available slot from top-to-bottom and left-to-right.
                </span>
              </li>
              <li className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-lg border border-amber-500/20">
                <span className="text-amber-400 font-bold shrink-0 mt-0.5">• Round 2 (Global BFS Level Order):</span>
                <span>
                  Connects to <strong className="text-amber-300">any eligible node across the entire network regardless of sponsor</strong>, 
                  filling the shallowest global level from top to bottom, left-to-right to support all network participants.
                </span>
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: 'rank-upgrade-vault',
        category: 'ranks',
        questionTh: 'Upgrade Vault (35%) สะสมอย่างไร และนำไปอัปเกรดระดับ Rank ได้อย่างไร?',
        questionEn: 'How does the Upgrade Vault (35%) accumulate and trigger rank upgrades?',
        tagsTh: ['Upgrade Vault', 'Rank 1-27', 'สะสมเงิน', 'อัปเกรด'],
        tagsEn: ['Upgrade Vault', 'Rank 1-27', 'Accumulation', 'Upgrade'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              ในทุกครั้งที่มีสมาชิกใหม่ลงทะเบียนในขารหัสซ้าย (Left Child) สัญญาจะจัดสรร 35% ของค่าแพ็กเกจเข้าสู่ 
              <strong className="text-emerald-400"> Upgrade Vault</strong> ประจำตัวของรหัสนั้นบน Smart Contract โดยอัตโนมัติ
            </p>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-700/50 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>ราคาเริ่มต้น Rank 1:</span>
                <span className="text-emerald-400 font-mono font-semibold">5.00 USDT</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>ราคาอัปเกรด Rank 2:</span>
                <span className="text-emerald-400 font-mono font-semibold">10.00 USDT</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>จำนวนระดับ Rank ทั้งหมด:</span>
                <span className="text-indigo-400 font-mono font-semibold">27 Ranks (สูงสุด 10,000 USDT)</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              เมื่อยอดเงินใน Vault สะสมครบตามราคาของ Rank ถัดไป ระบบจะปลดล็อกปุ่มอัปเกรด หรือสามารถเลือกจ่ายส่วนต่างผ่านกระเป๋าเงิน USDT ได้ทันที
            </p>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              Every time a placement occurs on a Left Child node, 35% of the rank fee is locked into the node&apos;s on-chain 
              <strong className="text-emerald-400"> Upgrade Vault</strong>.
            </p>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-700/50 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Rank 1 Entry Fee:</span>
                <span className="text-emerald-400 font-mono font-semibold">5.00 USDT</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Rank 2 Upgrade Cost:</span>
                <span className="text-emerald-400 font-mono font-semibold">10.00 USDT</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Total Supported Ranks:</span>
                <span className="text-indigo-400 font-mono font-semibold">27 Ranks (Up to 10,000 USDT)</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Once the vault reaches the threshold for the next rank, you can trigger the upgrade using the accumulated funds, or top-up the difference directly via your USDT wallet.
            </p>
          </div>
        ),
      },
      {
        id: 'vault-3-pools-rule',
        category: 'ranks',
        questionTh: 'กฎการคำนวณ 3 Pools (Upgrade Rank, New Auto ID, New Extra ID) ของ Idหลักนั้นๆ เป็นอย่างไร?',
        questionEn: 'How are the 3 Vault Pools (Upgrade Rank, New Auto ID, New Extra ID) calculated for each specific Main ID?',
        tagsTh: ['Upgrade Rank Pool', 'New Auto ID Pool', 'New Extra ID Pool', '5 rank ย้อนหลัง', 'Idหลักนั้นๆ'],
        tagsEn: ['Upgrade Rank Pool', 'New Auto ID Pool', 'New Extra ID Pool', '5 Ranks Backwards', 'Main ID Scoped'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs">
              <strong className="text-indigo-300 block mb-1">🎯 หลักการสำคัญ: Idหลักนั้นๆ ไม่ใช่ไอดีหลักของกระเป๋า</strong>
              <span>
                1 กระเป๋าเงินสามารถเป็นเจ้าของรหัสหลักได้หลายรหัส (จากการสมัครหรือจาก Auto New Main ID) โดยแต่ละรหัสหลักจะแยกเงินและกระปุก Vault อิสระของใครของมัน ไม่นำมารวมปนกัน
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/70 border border-amber-500/30">
                <span className="text-amber-400 font-bold block mb-1">
                  1. Upgrade Rank Pool: ยอดสะสม Vault (35%) ของ 5 rank ย้อนหลัง
                </span>
                <span className="text-slate-300 block mb-1">
                  <strong>นิยาม:</strong> 5 rank ย้อนหลัง = &quot;สถานะ rank ปัจจุบันของ idหลักนั้น ถอยหลัง 5 rank&quot; (ช่วง Rank: [Max(1, currentRank - 4) ... currentRank])
                </span>
                <span className="text-slate-400">
                  ใช้สำหรับการสะสมเงินเพื่ออัปเกรดสู่แรงค์ถัดไป โดยไม่ต้องใช้เหรียญในกระเป๋า
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/70 border border-yellow-500/30">
                <span className="text-yellow-400 font-bold block mb-1">
                  2. New Auto ID Pool: ยอดสะสม Vault (35%) ใน Rank 1 ถึง 3 ลบด้วย 5 rank ย้อนหลัง
                </span>
                <span className="text-slate-300 block mb-1">
                  <strong>นิยาม:</strong> รหัสใน Rank 1 ถึง 3 ที่หลุดพ้นจากช่วง 5 rank ย้อนหลังของรหัสหลักนั้นแล้ว
                </span>
                <span className="text-slate-400">
                  เมื่อสะสมครบ 5.00 USDT ปลดล็อกสิทธิ์สร้าง <strong>Auto New Main ID</strong> ใหม่ได้ทันที (เงินแยก ไม่ใช้เหรียญในกระเป๋า)
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-500/30">
                <span className="text-cyan-400 font-bold block mb-1">
                  3. New Extra ID Pool: ยอดสะสม Vault (35%) ใน Rank 4 ถึง 27
                </span>
                <span className="text-slate-300 block mb-1">
                  <strong>สูตร:</strong>
                  <br />• สถานะ rank ปัจจุบันต่ำกว่า 27: ยอดสะสม Vault (35%) ใน Rank 4 ถึง 27 ลบด้วย 5 rank ย้อนหลังของรหัสหลักนั้น
                  <br />• สถานะ rank ปัจจุบันเท่ากับ 27: ยอดสะสม Vault (35%) ใน Rank 4 ถึง 27 ทั้งหมด
                </span>
                <span className="text-slate-400">
                  <strong>การเกิด:</strong> นำยอด <strong>New Extra ID Pool</strong> มาลูปหาราคาแต่ละ Rank จาก <strong>Rank 27 ลงมาถึง Rank 2</strong> เมื่อยอดสะสมครบตามราคาของ Rank ใด จะปลดล็อกสร้าง <strong>Auto Extra ID</strong> ใน Rank นั้นทันที
                </span>
              </div>
            </div>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs">
              <strong className="text-indigo-300 block mb-1">🎯 Core Rule: Scoped to That Specific Main ID, Not Global Wallet</strong>
              <span>
                A wallet can hold multiple Main IDs. Each Main ID maintains an independent Vault progression and balance.
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/70 border border-amber-500/30">
                <span className="text-amber-400 font-bold block mb-1">1. Upgrade Rank Pool</span>
                <span>Accumulated Vault (35%) of the 5 ranks backwards from that Main ID&apos;s current rank: [Max(1, currentRank - 4) ... currentRank]. Used to unlock next rank.</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/70 border border-yellow-500/30">
                <span className="text-yellow-400 font-bold block mb-1">2. New Auto ID Pool</span>
                <span>Vault (35%) in Rank 1 to 3 minus 5 ranks backwards. Unlocks +1 Auto New Main ID upon reaching 5.00 USDT (separate funds, not wallet balance).</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-500/30">
                <span className="text-cyan-400 font-bold block mb-1">3. New Extra ID Pool</span>
                <span>If current rank &lt; 27: Vault (35%) in Rank 4 to 27 minus 5 ranks backwards. If current rank == 27: Vault (35%) in Rank 4 to 27 in full. Unlocks Auto Extra ID in Rank 2-27 when reaching target rank price.</span>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'main-vs-extra-id',
        category: 'ranks',
        questionTh: 'Main ID และ Auto Extra ID (Rank 2-27) แตกต่างกันอย่างไร?',
        questionEn: 'What is the distinction between Main ID and Auto Extra ID (Rank 2-27)?',
        tagsTh: ['Main ID', 'Auto Extra ID', 'Rank 2-27'],
        tagsEn: ['Main ID', 'Auto Extra ID', 'Rank 2-27'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              สัญญารองรับการแยกบริหารจัดการรหัสระหว่างบัญชีหลักและรหัสเสริม เพื่อเพิ่มความยืดหยุ่นในการขยายเครือข่าย:
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-indigo-500/30">
                <span className="text-indigo-300 font-semibold block mb-0.5">🏷️ Main ID (รหัสหลัก):</span>
                <span>
                  เป็นรหัสหลักของผู้ใช้งาน (ทั้งจากการสมัครตรงใน Rank 1 และจาก Auto New Main ID) ทำหน้าที่เป็นจุดยึดสายงานหลักและรับค่าแนะนำตรง รวมถึงโบนัสระดับชั้น 15 ระดับ
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-fuchsia-500/30">
                <span className="text-fuchsia-300 font-semibold block mb-0.5">⭐ Auto Extra ID (Rank 2 ถึง Rank 27):</span>
                <span>
                  <strong>การเกิด:</strong> สะสมครบตาม ราคา Rank เป้าหมาย ปลดล็อกสร้าง Auto Extra ID ใน Rank 2-27 เพื่อสร้างสายงานแยกคู่ขนานและรับผลตอบแทนทวีคูณในแต่ละ Rank
                </span>
              </div>
            </div>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              The smart contract protocol segregates user accounts into Main IDs and Extra IDs for compounding rewards:
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-indigo-500/30">
                <span className="text-indigo-300 font-semibold block mb-0.5">🏷️ Main ID:</span>
                <span>
                  Your primary root registration, serving as the master recipient for direct referral commissions and 15-tier pass-up bonuses.
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-fuchsia-500/30">
                <span className="text-fuchsia-300 font-semibold block mb-0.5">⭐ Auto Extra ID (Rank 2 to 27):</span>
                <span>
                  Unlocks Auto Extra ID in Rank 2-27 once New Extra ID Pool accumulates the target Rank price, allowing automated Extra ID nodes to build independent sub-matrices.
                </span>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'approve-usdt',
        category: 'contracts',
        questionTh: 'ทำไมต้องกดยืนยันอนุมัติ USDT (Approve) ก่อนลงทะเบียนหรืออัปเกรด?',
        questionEn: 'Why is USDT Approval required before registration or rank upgrades?',
        tagsTh: ['Approve', 'USDT', 'ERC-20', 'ความปลอดภัย'],
        tagsEn: ['Approve', 'USDT', 'ERC-20', 'Security'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              ตามมาตรฐานความปลอดภัยของโทเค็น <strong className="text-cyan-400">BEP-20 / ERC-20</strong> บนบล็อกเชน 
              Smart Contract จะไม่มีสิทธิ์ดึงเหรียญออกจากกระเป๋าของผู้ใช้ได้ จนกว่าเจ้าของกระเป๋าจะทำการอนุญาต (Approve Allowance) 
              ด้วยการลงนามธุรกรรม
            </p>
            <p className="text-xs text-slate-400">
              การกดปุ่ม &quot;อนุมัติ USDT&quot; เป็นขั้นตอนที่ปลอดภัยและเป็นมาตรฐานของระบบ Web3 ทั้งหมด 
              โดยระบบจะขออนุมัติตามจำนวนที่จำเป็นต้องใช้สำหรับการทำรายการ
            </p>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              Under the <strong className="text-cyan-400">BEP-20 / ERC-20</strong> token standard, smart contracts are cryptographically 
              prevented from accessing tokens from user wallets without an explicit prior approval (allowance).
            </p>
            <p className="text-xs text-slate-400">
              Approving is a standard, secure step in Web3. It grants the contract permission to transfer only the designated USDT fee upon your confirmation.
            </p>
          </div>
        ),
      },
      {
        id: 'realtime-sync',
        category: 'contracts',
        questionTh: 'ระบบซิงค์ข้อมูล Real-Time อย่างไร และผังต้นไม้อัปเดตบ่อยแค่ไหน?',
        questionEn: 'How does real-time synchronization work and how frequently does the tree update?',
        tagsTh: ['Real-Time', '30 วินาที', 'Auto-Sync', 'RPC'],
        tagsEn: ['Real-Time', '30s', 'Auto-Sync', 'RPC'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              ระบบรองรับการอัปเดตแบบ <strong className="text-emerald-400">Real-Time อัตโนมัติทุกๆ 30 วินาที</strong> 
              (สามารถปรับเลือกความถี่ได้เป็น 10 วิ, 30 วิ หรือ 60 วิ ได้ที่แถบควบคุมผัง)
            </p>
            <p className="text-xs text-slate-400">
              นอกจากนี้ เมื่อคุณทำธุรกรรมบนบล็อกเชนสำเร็จ เช่น สมัครสมาชิก, ซื้อแพ็กเกจ หรืออัปเกรด Rank 
              ระบบจะดักจับ On-Chain Event และสั่งรีเฟรชข้อมูลผังให้ทันทีโดยไม่ต้องรอรอบเวลา
            </p>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              The visualizer includes an <strong className="text-emerald-400">automated background polling loop running every 30 seconds</strong> 
              (configurable to 10s, 30s, or 60s in the visualizer controls).
            </p>
            <p className="text-xs text-slate-400">
              Additionally, whenever any on-chain event (such as registration, rank upgrade, or rebirth trigger) completes via your connected wallet, the tree refreshes instantaneously.
            </p>
          </div>
        ),
      },
      {
        id: 'gas-and-network',
        category: 'contracts',
        questionTh: 'ต้องเตรียมเหรียญอะไรบ้างสำหรับค่าธรรมเนียมเครือข่าย (Gas Fees)?',
        questionEn: 'What currencies are required for blockchain gas fees and transactions?',
        tagsTh: ['Gas Fee', 'tBNB', 'BSC Testnet', 'USDT'],
        tagsEn: ['Gas Fee', 'tBNB', 'BSC Testnet', 'USDT'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              ระบบทำงานบนเครือข่าย <strong className="text-amber-400">BNB Smart Chain Testnet (Chain ID 97)</strong> 
              ท่านต้องมีเหรียญ 2 ชนิดในกระเป๋า:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-amber-500/20">
                <span className="font-semibold text-amber-400 block">1. tBNB (สำหรับค่า Gas)</span>
                <span className="text-slate-400">ใช้สำหรับค่าธรรมเนียมธุรกรรมบนเครือข่าย BSC แนะนำให้มีประมาณ 0.01 - 0.05 tBNB (รับฟรีได้จาก BSC Testnet Faucet)</span>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-emerald-500/20">
                <span className="font-semibold text-emerald-400 block">2. USDT (BEP-20)</span>
                <span className="text-slate-400">ใช้สำหรับการสมัครสมาชิกและการอัปเกรด Rank โดยเริ่มต้นที่ 5 USDT สำหรับ Rank 1</span>
              </div>
            </div>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>
              The application runs on the <strong className="text-amber-400">BNB Smart Chain Testnet (Chain ID 97)</strong>. 
              You require two currencies in your Web3 wallet:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-amber-500/20">
                <span className="font-semibold text-amber-400 block">1. tBNB (Gas Fees)</span>
                <span className="text-slate-400">Used for transaction execution on BSC. We recommend keeping 0.01 - 0.05 tBNB (available free via BSC Testnet Faucets).</span>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-emerald-500/20">
                <span className="font-semibold text-emerald-400 block">2. USDT (BEP-20)</span>
                <span className="text-slate-400">Used for entry fees and rank upgrades (e.g. 5 USDT for Rank 1).</span>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'tx-troubleshooting',
        category: 'troubleshooting',
        questionTh: 'หากทำธุรกรรมแล้วไม่สำเร็จ (Transaction Reverted) ควรแก้ไขอย่างไร?',
        questionEn: 'How to troubleshoot if a blockchain transaction fails or reverts?',
        tagsTh: ['แก้ไขปัญหา', 'Tx Failed', 'Allowance', 'Sponsor'],
        tagsEn: ['Troubleshoot', 'Tx Failed', 'Allowance', 'Sponsor'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>ข้อผิดพลาดส่วนใหญ่ที่พบบนบล็อกเชนเกิดจากสาเหตุต่อไปนี้:</p>
            <ol className="list-decimal pl-4 space-y-1.5 text-xs text-slate-300">
              <li>
                <strong className="text-white">ยอด USDT Allowance ไม่เพียงพอ:</strong> ให้กดปุ่ม &quot;อนุมัติ USDT&quot; ใหม่อีกครั้งเพื่อเพิ่มวงเงิน
              </li>
              <li>
                <strong className="text-white">ค่า Gas (tBNB) ไม่พอ:</strong> ตรวจสอบว่ามีเหรียญ tBNB สำหรับชำระค่าธรรมเนียมธุรกรรม
              </li>
              <li>
                <strong className="text-white">รหัสผู้แนะนำ (Sponsor Node ID) ไม่ถูกต้อง:</strong> ต้องใช้ Node ID ที่มีอยู่จริงและเปิดใช้งานแล้วบนบล็อกเชน (เช่น Node #1)
              </li>
              <li>
                <strong className="text-white">เครือข่ายกระเป๋าไม่ตรง:</strong> ต้องสลับไปใช้ BNB Smart Chain Testnet (Chain ID 97)
              </li>
            </ol>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>Common causes for reverted transactions include:</p>
            <ol className="list-decimal pl-4 space-y-1.5 text-xs text-slate-300">
              <li>
                <strong className="text-white">Insufficient USDT Allowance:</strong> Click &quot;Approve USDT&quot; again to refresh on-chain allowance.
              </li>
              <li>
                <strong className="text-white">Insufficient tBNB for Gas:</strong> Ensure your wallet balance has at least 0.005 tBNB for gas execution.
              </li>
              <li>
                <strong className="text-white">Invalid Sponsor Node ID:</strong> Ensure the target sponsor ID exists and is actively confirmed on-chain (e.g. Node #1).
              </li>
              <li>
                <strong className="text-white">Mismatched Network:</strong> Ensure your wallet network is set to BNB Smart Chain Testnet (Chain ID 97).
              </li>
            </ol>
          </div>
        ),
      },
      {
        id: 'contract-verification',
        category: 'troubleshooting',
        questionTh: 'ตรวจสอบ Smart Contract ปัจจุบันได้อย่างไร?',
        questionEn: 'How can I verify the active Smart Contract address?',
        tagsTh: ['Smart Contract', 'BscScan', 'Address', 'ตรวจสอบ'],
        tagsEn: ['Smart Contract', 'BscScan', 'Address', 'Verification'],
        answerTh: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>Smart Contract ปัจจุบันของระบบคือ:</p>
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-mono text-xs text-emerald-400 break-all select-all">
                {contractAddress}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyText('contract', contractAddress)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 transition"
                >
                  {copiedId === 'contract' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>คัดลอก</span>
                    </>
                  )}
                </button>
                <a
                  href={`https://testnet.bscscan.com/address/${contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 text-xs bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded-lg flex items-center gap-1 transition"
                >
                  <span>BscScan</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              สัญญา USDT (BEP-20) บน BSC Testnet: <code className="text-slate-300">{usdtAddress}</code>
            </p>
          </div>
        ),
        answerEn: (
          <div className="space-y-3 text-slate-300 leading-relaxed text-sm">
            <p>The active smart contract address deployed on BNB Smart Chain Testnet is:</p>
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-mono text-xs text-emerald-400 break-all select-all">
                {contractAddress}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyText('contract', contractAddress)}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 transition"
                >
                  {copiedId === 'contract' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <a
                  href={`https://testnet.bscscan.com/address/${contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 text-xs bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded-lg flex items-center gap-1 transition"
                >
                  <span>BscScan</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              USDT (BEP-20) on BSC Testnet: <code className="text-slate-300">{usdtAddress}</code>
            </p>
          </div>
        ),
      },
    ],
    [contractAddress, usdtAddress, copiedId]
  );

  const categories = [
    {
      id: 'all',
      nameTh: 'คำถามทั้งหมด',
      nameEn: 'All Questions',
      icon: HelpCircle,
    },
    {
      id: 'matrix',
      nameTh: 'ผังไบนารี่ & โคลนนิ่ง',
      nameEn: 'Binary Matrix & Clones',
      icon: GitFork,
    },
    {
      id: 'ranks',
      nameTh: 'Rank & Upgrade Vault',
      nameEn: 'Ranks & Upgrade Vault',
      icon: TrendingUp,
    },
    {
      id: 'contracts',
      nameTh: 'Smart Contract & Web3',
      nameEn: 'Smart Contract & Web3',
      icon: FileCode2,
    },
    {
      id: 'troubleshooting',
      nameTh: 'การแก้ปัญหา & ข้อแนะนำ',
      nameEn: 'Troubleshooting & Tips',
      icon: AlertCircle,
    },
  ];

  const filteredFaqs = useMemo(() => {
    return faqData.filter((item) => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const textTh = `${item.questionTh} ${item.tagsTh.join(' ')}`.toLowerCase();
      const textEn = `${item.questionEn} ${item.tagsEn.join(' ')}`.toLowerCase();

      return textTh.includes(q) || textEn.includes(q);
    });
  }, [faqData, selectedCategory, searchQuery]);

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 lg:p-8 backdrop-blur-sm shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                {language === 'th' ? 'คำถามที่พบบ่อย (FAQ)' : 'Frequently Asked Questions'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                {language === 'th'
                  ? 'คู่มือและคำตอบเกี่ยวกับระบบผังไบนารี่ V7, การอัปเกรด Rank และการทำงานของ Smart Contract'
                  : 'Comprehensive guide covering V7 matrix mechanics, rank upgrades, and smart contract execution'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Expand / Collapse controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExpandAll}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg transition border border-slate-700/60"
          >
            {language === 'th' ? 'ขยายทั้งหมด' : 'Expand All'}
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg transition border border-slate-700/60"
          >
            {language === 'th' ? 'ยุบทั้งหมด' : 'Collapse All'}
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-5 space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === 'th'
                ? 'ค้นหาคำถาม (เช่น โคลนนิ่ง, Upgrade Vault, Approve, Gas Fee, ขารหัสขวา...)'
                : 'Search questions (e.g. cloning, upgrade vault, approve, gas fees, right leg...)'
            }
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/50 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition cursor-pointer border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                    : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{language === 'th' ? cat.nameTh : cat.nameEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Questions Accordion List */}
      <div className="mt-6 space-y-3">
        {filteredFaqs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/80">
            <HelpCircle className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-60" />
            <p className="text-sm">
              {language === 'th' ? 'ไม่พบคำถามที่ตรงกับการค้นหา' : 'No matching questions found.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-3 text-xs text-indigo-400 hover:underline"
            >
              {language === 'th' ? 'รีเซ็ตการค้นหา' : 'Reset search filter'}
            </button>
          </div>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = !!openItems[faq.id];
            return (
              <div
                key={faq.id}
                className={`rounded-xl border transition-colors ${
                  isOpen
                    ? 'bg-slate-950/70 border-indigo-500/40 shadow-sm'
                    : 'bg-slate-950/30 border-slate-800/80 hover:border-slate-700/80'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(faq.id)}
                  className="w-full px-4 py-3.5 text-left flex items-start justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-indigo-400 font-mono text-xs font-bold mt-0.5 shrink-0">
                      Q:
                    </span>
                    <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition leading-snug">
                      {language === 'th' ? faq.questionTh : faq.questionEn}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0 transition-transform duration-200 mt-1 ${
                      isOpen ? 'rotate-180 text-indigo-400' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 mt-1 animate-fadeIn">
                    <div className="text-xs sm:text-sm text-slate-300">
                      {language === 'th' ? faq.answerTh : faq.answerEn}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/40">
                      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        Tags:
                      </span>
                      {(language === 'th' ? faq.tagsTh : faq.tagsEn).map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Quick Summary Footer Card */}
      <div className="mt-8 p-4 rounded-xl bg-gradient-to-r from-indigo-950/30 via-slate-900 to-emerald-950/20 border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-white">
              {language === 'th' ? 'Smart Contract ตรวจสอบได้ 100% บนบล็อกเชน' : '100% Verifiable Smart Contract'}
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-400">
              {language === 'th'
                ? 'ทุกการคำนวณและกระจายผลประโยชน์ทำงานแบบกระจายศูนย์ ไร้ตัวกลาง ไม่สามารถแก้ไขย้อนหลังได้'
                : 'All matrix placements and reward distributions are executed immutably on-chain via Solidity smart contracts.'}
            </p>
          </div>
        </div>

        <a
          href={`https://testnet.bscscan.com/address/${contractAddress}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 rounded-xl transition whitespace-nowrap shrink-0 shadow-sm"
        >
          <span>{language === 'th' ? 'ดูสัญญาบน BscScan' : 'View on BscScan'}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </section>
  );
};
