import { BrowserProvider, Contract, JsonRpcProvider, formatEther, id, parseEther, type Eip1193Provider } from "ethers";

export const CC3 = {
  chainId: 102031,
  chainIdHex: "0x18e8f",
  name: "Creditcoin Testnet",
  rpcUrl: "https://rpc.cc3-testnet.creditcoin.network/",
  explorerUrl: "https://creditcoin-testnet.blockscout.com/",
  currency: { name: "Creditcoin Testnet CTC", symbol: "tCTC", decimals: 18 },
} as const;

export const SEPOLIA = {
  chainId: 11155111,
  chainIdHex: "0xaa36a7",
  name: "Sepolia",
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorerUrl: "https://sepolia.etherscan.io/",
  currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  factory: "0x018c883E0632D7a5754d15b7Da83A0e93554db03",
  aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  weth: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
} as const;

export const PUBLISHED_COMPLETED_REFERENCE = {
  verdAddress: "0x37b858D0ADfDcBF851F17d87d69E02F7F9fA8328",
  facilityId: "0xb1530a86a4ab63fe19f2777fb5f979ec7aaf0a3bd9ac108507783714fc50d136",
} as const;

export const VERIFIED_DEPLOYMENT = {
  verdAddress: import.meta.env.VITE_VERD_ADDRESS || PUBLISHED_COMPLETED_REFERENCE.verdAddress,
  facilityId: import.meta.env.VITE_VERD_REFERENCE_FACILITY_ID || PUBLISHED_COMPLETED_REFERENCE.facilityId,
  workerUrl: "https://verd-phase5-worker.onrender.com",
} as const;

export const WORKER_URL = import.meta.env.VITE_VERD_WORKER_URL || VERIFIED_DEPLOYMENT.workerUrl;

export const VERIFIED_EVIDENCE = {
  createFacilityTx: "0x4de1bed1aacc73cbdb3d54abd47ef7d8497076446957e33473759559a2d90f40",
  lockerCreationTx: "0x8d459e60f51824e4cb2254fbcb48dc21fefe188e8848365e7c5617625fa6c6e9",
  lockerBindingTx: "0xf975e011ac9d8a0d68b1f1515b4c27b33e1bd26172713a8f1e4ea81b02b2bab3",
  fundFacilityTx: "0x3dadcf71ff53c1c16682c94f648628fe90a72ac745d371131c1fd54ce2658886",
  reserveSupplyTx: "0xaeccbb4051fba1ec451e383694c1ed555ad53b81abbd2fa0181b005a14822d0b",
  qualificationTx: "0xb3217820882bfaa525a408ab33d56e906748174ea9472575dccafb0ea94451a2",
  drawTx: "0xce99f59b11d1b362305adb69e9aa5eb373226ed1a3651159fba22113a144460b",
  repaymentTx: "0x1307c19d6b48ec550a06905f8c3d5f518ed15d4dc8275a815af2997293b84dec",
  reserveReleaseTx: "0xb1567d3b3505be0bdcfb92f23751bda06a64ead73bd3c81506c4d4424f526bd4",
  qualificationProofId: "0xc9d9d5d00ab970a542d5fd1b92abc31f48cd4484f38f943421035ee6ec18e587",
  bindingProofId: "0xab452bb86b52de3409a886d958d5c57620cbe6d3f9cdc0e28163f64119fcda3d",
  releaseProofId: "0x98c198283a5201c70be777a89f849ab9fa2ef1c2a33ef658d1e004915c394408",
  sepoliaExplorerUrl: "https://sepolia.etherscan.io/tx/",
} as const;

export const VERD_WEB_ABI = [
  "function facilityExists(bytes32 facilityId) view returns (bool)",
  "function facilityState(bytes32 facilityId) view returns (uint8)",
  "function getFacility(bytes32 facilityId) view returns (address lender,address borrower,uint256 principal,uint256 outstandingPrincipal,uint256 standardAprBps,uint256 preferredAprBps,uint256 currentAprBps,uint256 accruedInterest,uint64 maturity,uint64 qualificationDeadline,uint256 requiredReserveAmount,address reserveLocker)",
  "function getFacilityStatus(bytes32 facilityId) view returns (uint64 lastAccrualTimestamp,bool funded,bool drawn,bool preferredRateActive,bool repaid,bool reserveReleased,bool drawnAtPreferredRate,uint256 repaidAmount)",
  "function getFacilityProof(bytes32 facilityId) view returns (bytes32 qualificationProofId,uint64 qualificationSourceBlock,uint256 reserveReleaseAmount)",
  "function getFacilityReleaseEvidence(bytes32 facilityId) view returns (bytes32 releaseProofId,uint64 releaseSourceBlock,uint256 releaseAmount)",
  "function getFacilityLockerBinding(bytes32 facilityId) view returns (bytes32 bindingProofId,uint64 bindingSourceBlock,uint64 unlockTime)",
  "function createFacility(bytes32 facilityId,address borrower,uint256 principal,uint256 standardAprBps,uint256 preferredAprBps,uint64 maturity,uint64 qualificationDeadline,uint256 requiredReserveAmount)",
  "function fundFacility(bytes32 facilityId) payable",
  "function drawFacility(bytes32 facilityId) returns (uint256 amount)",
  "function accrueInterest(bytes32 facilityId) returns (uint256 totalAccruedInterest)",
  "function repayFacility(bytes32 facilityId) payable",
  "function getFacilityFinancials(bytes32 facilityId) view returns (uint256 outstandingPrincipal,uint256 accruedInterest,uint256 currentAprBps)",
];

const SEPOLIA_FACTORY_ABI = [
  "function createReserveLocker(bytes32 facilityId,address borrower,uint64 unlockTime) returns (address lockerAddress)",
  "function facilityLocker(bytes32 facilityId) view returns (address)",
];
const SEPOLIA_ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function deposit() payable",
];
const SEPOLIA_AAVE_ABI = ["function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)"];
const SEPOLIA_LOCKER_ABI = ["function release() returns (uint256)"];

export const FACILITY_STATE_LABELS = [
  "Draft",
  "Funding pending",
  "Awaiting borrower action",
  "Qualification in progress",
  "Preferred Rate Condition active",
  "Drawn standard",
  "Drawn preferred",
  "Active",
  "Qualification expired",
  "Matured",
  "Repayment pending",
  "Repaid",
  "Reserve releasable",
  "Complete",
  "Failed with recovery required",
] as const;

export type FacilityRecord = {
  id: string;
  lender: string;
  borrower: string;
  principal: bigint;
  outstandingPrincipal: bigint;
  standardAprBps: bigint;
  preferredAprBps: bigint;
  currentAprBps: bigint;
  accruedInterest: bigint;
  maturity: number;
  qualificationDeadline: number;
  requiredReserveAmount: bigint;
  reserveLocker: string;
  lastAccrualTimestamp: number;
  funded: boolean;
  drawn: boolean;
  preferredRateActive: boolean;
  repaid: boolean;
  reserveReleased: boolean;
  drawnAtPreferredRate: boolean;
  repaidAmount: bigint;
  qualificationProofId: string;
  qualificationSourceBlock: number;
  reserveReleaseAmount: bigint;
  releaseProofId: string;
  releaseSourceBlock: number;
  bindingProofId: string;
  bindingSourceBlock: number;
  lockerUnlockTime: number;
  state: number;
};

export async function loadFacility(id: string = VERIFIED_DEPLOYMENT.facilityId): Promise<FacilityRecord> {
  const provider = new JsonRpcProvider(CC3.rpcUrl, CC3.chainId, { staticNetwork: true });
  const contract = new Contract(VERIFIED_DEPLOYMENT.verdAddress, VERD_WEB_ABI, provider);
  const exists = await contract.facilityExists(id);
  if (!exists) throw new Error("The facility was not found in the verified Verd deployment.");
  const [facility, status, proof, binding, release, state] = await Promise.all([
    contract.getFacility(id),
    contract.getFacilityStatus(id),
    contract.getFacilityProof(id),
    contract.getFacilityLockerBinding(id),
    contract.getFacilityReleaseEvidence(id),
    contract.facilityState(id),
  ]);
  return {
    id,
    lender: facility[0], borrower: facility[1], principal: facility[2], outstandingPrincipal: facility[3],
    standardAprBps: facility[4], preferredAprBps: facility[5], currentAprBps: facility[6], accruedInterest: facility[7],
    maturity: Number(facility[8]), qualificationDeadline: Number(facility[9]), requiredReserveAmount: facility[10], reserveLocker: facility[11],
    lastAccrualTimestamp: Number(status[0]), funded: status[1], drawn: status[2], preferredRateActive: status[3], repaid: status[4], reserveReleased: status[5], drawnAtPreferredRate: status[6], repaidAmount: status[7],
    qualificationProofId: proof[0], qualificationSourceBlock: Number(proof[1]), reserveReleaseAmount: proof[2], releaseProofId: release[0], releaseSourceBlock: Number(release[1]),
    bindingProofId: binding[0], bindingSourceBlock: Number(binding[1]), lockerUnlockTime: Number(binding[2]), state: Number(state),
  };
}

export function formatToken(value: bigint, symbol: string, maximumFractionDigits = 4) {
  return `${Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits })} ${symbol}`;
}
export function formatCtc(value: bigint) { return formatToken(value, "tCTC"); }
export function formatApr(value: bigint) { return `${(Number(value) / 100).toFixed(2)}%`; }
export function formatDate(timestamp: number) { return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(timestamp * 1000)); }
export function short(value: string) { return `${value.slice(0, 6)}...${value.slice(-4)}`; }
export function explorerAddress(address: string) { return `${CC3.explorerUrl}address/${address}`; }
export function explorerTx(hash: string) { return `${CC3.explorerUrl}tx/${hash}`; }
export function sepoliaExplorerTx(hash: string) { return `${SEPOLIA.explorerUrl}tx/${hash}`; }
export function hasProof(value: string) { return Boolean(value && !/^0x0+$/.test(value)); }
export function hasAddress(value: string) { return Boolean(value && !/^0x0{40}$/i.test(value)); }

export type BrowserFacilityProgress = {
  lockerTransactionHash?: string;
  reserveSupplyHash?: string;
  releaseTransactionHash?: string;
  sourceTxHash?: string;
  sourceBlock?: string;
  jobId?: string;
  jobOperation?: "binding" | "qualification" | "release";
  updatedAt: string;
};

const FACILITY_PROGRESS_KEY = "verd.facility-progress.v1";
const RECENT_FACILITIES_KEY = "verd.recent-facilities.v1";

function readBrowserJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

function writeBrowserJson(key: string, value: unknown) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Browser recovery is optional. Chain and worker state remain authoritative. */ }
}

export function readFacilityProgress(facilityId: string): BrowserFacilityProgress | undefined {
  return readBrowserJson<Record<string, BrowserFacilityProgress>>(FACILITY_PROGRESS_KEY, {})[facilityId.toLowerCase()];
}

export function saveFacilityProgress(facilityId: string, patch: Partial<BrowserFacilityProgress>) {
  const all = readBrowserJson<Record<string, BrowserFacilityProgress>>(FACILITY_PROGRESS_KEY, {});
  const key = facilityId.toLowerCase();
  const current = all[key] ?? { updatedAt: new Date(0).toISOString() };
  const next = Object.fromEntries(Object.entries({ ...current, ...patch, updatedAt: new Date().toISOString() }).filter(([, value]) => value !== undefined)) as BrowserFacilityProgress;
  all[key] = next;
  writeBrowserJson(FACILITY_PROGRESS_KEY, all);
  rememberFacility(facilityId);
  return next;
}

export function rememberFacility(facilityId: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(facilityId)) return;
  const ids = readBrowserJson<string[]>(RECENT_FACILITIES_KEY, []).filter(id => id.toLowerCase() !== facilityId.toLowerCase());
  writeBrowserJson(RECENT_FACILITIES_KEY, [facilityId, ...ids].slice(0, 12));
}

export function readRecentFacilities() {
  return readBrowserJson<string[]>(RECENT_FACILITIES_KEY, []).filter(id => /^0x[a-fA-F0-9]{64}$/.test(id));
}

export type TestnetBalances = { cc3: bigint; sepoliaEth: bigint; weth: bigint };

export async function readTestnetBalances(account: string): Promise<TestnetBalances> {
  const sepolia = new JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId, { staticNetwork: true });
  const cc3 = new JsonRpcProvider(CC3.rpcUrl, CC3.chainId, { staticNetwork: true });
  const weth = new Contract(SEPOLIA.weth, SEPOLIA_ERC20_ABI, sepolia);
  const [cc3Balance, sepoliaEth, wethBalance] = await Promise.all([cc3.getBalance(account), sepolia.getBalance(account), weth.balanceOf(account) as Promise<bigint>]);
  return { cc3: cc3Balance, sepoliaEth, weth: wethBalance };
}

declare global { interface Window { ethereum?: Eip1193Provider; } }

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  return { provider, account: await (await provider.getSigner()).getAddress(), chainId: Number(network.chainId) };
}

export async function switchToCc3() {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CC3.chainIdHex }] });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) throw error;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: CC3.chainIdHex, chainName: CC3.name, nativeCurrency: CC3.currency, rpcUrls: [CC3.rpcUrl], blockExplorerUrls: [CC3.explorerUrl] }] });
  }
}

export async function switchToSepolia() {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA.chainIdHex }] });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) throw error;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: SEPOLIA.chainIdHex, chainName: SEPOLIA.name, nativeCurrency: SEPOLIA.currency, rpcUrls: [SEPOLIA.rpcUrl], blockExplorerUrls: [SEPOLIA.explorerUrl] }] });
  }
}

export async function createReserveLocker(id: string, borrower: string, unlockTime: number) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const factory = new Contract(SEPOLIA.factory, SEPOLIA_FACTORY_ABI, signer);
  const transaction = await factory.createReserveLocker(id, borrower, unlockTime);
  return transaction.hash as string;
}

export async function readReserveLocker(id: string) {
  const provider = new JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId, { staticNetwork: true });
  const factory = new Contract(SEPOLIA.factory, SEPOLIA_FACTORY_ABI, provider);
  return String(await factory.facilityLocker(id));
}

export async function supplyReserve(locker: string, amount: bigint) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();
  const token = new Contract(SEPOLIA.weth, SEPOLIA_ERC20_ABI, signer);
  const allowance = await token.allowance(owner, SEPOLIA.aavePool) as bigint;
  if (allowance < amount) {
    const approval = await token.approve(SEPOLIA.aavePool, amount);
    await approval.wait();
  }
  const pool = new Contract(SEPOLIA.aavePool, SEPOLIA_AAVE_ABI, signer);
  const transaction = await pool.supply(SEPOLIA.weth, amount, locker, 0);
  return transaction.hash as string;
}

export async function wrapSepoliaEth(amount: bigint) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const weth = new Contract(SEPOLIA.weth, SEPOLIA_ERC20_ABI, signer);
  const transaction = await weth.deposit({ value: amount });
  return transaction.hash as string;
}

export async function drawFacility(id: string) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(VERIFIED_DEPLOYMENT.verdAddress, VERD_WEB_ABI, signer);
  const transaction = await contract.drawFacility(id);
  return transaction.hash as string;
}

export async function fundFacility(id: string, principal: bigint) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(VERIFIED_DEPLOYMENT.verdAddress, VERD_WEB_ABI, signer);
  const transaction = await contract.fundFacility(id, { value: principal });
  return transaction.hash as string;
}

export function estimateRepayment(facility: FacilityRecord, nowSeconds = Math.floor(Date.now() / 1000)) {
  const elapsed = BigInt(Math.max(0, nowSeconds - facility.lastAccrualTimestamp));
  const interestSinceRead = facility.outstandingPrincipal * facility.currentAprBps * elapsed / 10_000n / 31_536_000n;
  return facility.outstandingPrincipal + facility.accruedInterest + interestSinceRead;
}

export function repaymentSubmissionAmount(facility: FacilityRecord) {
  const estimate = estimateRepayment(facility);
  const fifteenMinuteInterest = facility.outstandingPrincipal * facility.currentAprBps * 900n / 10_000n / 31_536_000n;
  return estimate + (fifteenMinuteInterest > 0n ? fifteenMinuteInterest : 1n);
}

export async function repayFacility(id: string, amount: bigint) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(VERIFIED_DEPLOYMENT.verdAddress, VERD_WEB_ABI, signer);
  const transaction = await contract.repayFacility(id, { value: amount });
  return transaction.hash as string;
}

export async function releaseReserve(locker: string) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(locker, SEPOLIA_LOCKER_ABI, signer);
  const transaction = await contract.release();
  return transaction.hash as string;
}

export function qualificationJobMessage(input: { facilityId: string; sourceTxHash: string; sourceBlock?: number; operation?: "qualification" | "binding" | "release" }, issuedAt: number) {
  return [
    "Verd qualification job",
    `Operation: ${input.operation ?? "qualification"}`,
    `Facility: ${input.facilityId}`,
    `Source transaction: ${input.sourceTxHash}`,
    `Source block: ${input.sourceBlock ?? "not supplied"}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

export async function registerQualificationJob(input: { facilityId: string; sourceTxHash: string; sourceBlock?: number; operation?: "qualification" | "binding" | "release" }) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const walletAddress = await signer.getAddress();
  const issuedAt = Date.now();
  const signature = await signer.signMessage(qualificationJobMessage(input, issuedAt));
  const response = await fetch(`${WORKER_URL}/public/qualification-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, walletAddress, signature, issuedAt }),
  });
  const result = await response.json() as { job?: { jobId: string }; message?: string };
  if (!response.ok) throw new Error(result.message ?? "The qualification job could not be registered.");
  return result;
}

export async function readQualificationJob(jobId: string) {
  const response = await fetch(`${WORKER_URL}/job-status/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error("The qualification job status is unavailable.");
  return await response.json() as { status: string; nextAction: string; terminal: boolean; lastErrorMessage?: string | null };
}

export type CreateFacilityTerms = {
  borrower: string;
  principal: string;
  standardApr: string;
  preferredApr: string;
  maturity: string;
  qualificationDeadline: string;
  requiredReserve: string;
};

export async function createFacility(terms: CreateFacilityTerms) {
  if (!window.ethereum) throw new Error("No compatible browser wallet was found.");
  const maturity = Math.floor(new Date(`${terms.maturity}T23:59:59Z`).getTime() / 1000);
  const qualificationDeadline = Math.floor(new Date(`${terms.qualificationDeadline}T23:59:59Z`).getTime() / 1000);
  if (!Number.isFinite(maturity) || !Number.isFinite(qualificationDeadline)) throw new Error("Choose valid facility dates.");
  if (qualificationDeadline > maturity) throw new Error("The qualification deadline must be on or before maturity.");
  const facilityId = id(`${terms.borrower.toLowerCase()}:${Date.now()}:${crypto.randomUUID()}`);
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new Contract(VERIFIED_DEPLOYMENT.verdAddress, VERD_WEB_ABI, signer);
  const transaction = await contract.createFacility(
    facilityId,
    terms.borrower,
    parseEther(terms.principal),
    Math.round(Number(terms.standardApr) * 100),
    Math.round(Number(terms.preferredApr) * 100),
    maturity,
    qualificationDeadline,
    parseEther(terms.requiredReserve),
  );
  return { facilityId, transactionHash: transaction.hash as string };
}
