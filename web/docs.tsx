import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { CC3, SEPOLIA, VERIFIED_DEPLOYMENT, VERIFIED_EVIDENCE, explorerAddress, explorerTx } from "./data/verd";

type DocBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "code"; language: string; code: string }
  | { kind: "callout"; tone: "info" | "warning" | "security"; label: string; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

export type DocsPage = {
  section: string;
  slug: string;
  title: string;
  eyebrow: string;
  lead: string;
  toc: string[];
  blocks: DocBlock[];
};

export type DocsSection = {
  id: string;
  label: string;
  pages: Array<Pick<DocsPage, "slug" | "title">>;
};

export const DOCS_SECTIONS: DocsSection[] = [
  { id: "start", label: "LEARN VERD", pages: [
    { slug: "introduction", title: "What Verd does" },
    { slug: "worked-example", title: "A facility in practice" },
    { slug: "how-it-works", title: "How Verd works" },
    { slug: "roles", title: "Lenders and borrowers" },
    { slug: "reserve-boundary", title: "What the reserve does" },
    { slug: "quickstart", title: "Take the product tour" },
  ] },
  { id: "use", label: "USE VERD", pages: [
    { slug: "lender-journey", title: "Lender journey" },
    { slug: "borrower-journey", title: "Borrower journey" },
    { slug: "facility-states", title: "Facility states and next actions" },
    { slug: "wallet-guide", title: "Wallet and testnet guidance" },
  ] },
  { id: "concepts", label: "PRODUCT CONCEPTS", pages: [
    { slug: "facilities", title: "Facilities" },
    { slug: "preferred-rate-condition", title: "Preferred Rate Condition" },
    { slug: "reserve-locker", title: "ReserveLocker" },
    { slug: "lifecycle", title: "Facility lifecycle" },
    { slug: "rate-model", title: "Rate and interest model" },
    { slug: "proof-model", title: "Cross-chain proof model" },
    { slug: "trust-model", title: "Trust and data boundaries" },
  ] },
  { id: "build", label: "BUILD", pages: [
    { slug: "prerequisites", title: "Prerequisites" },
    { slug: "deployments", title: "Networks and deployments" },
    { slug: "create-facility", title: "Create a facility" },
    { slug: "bind-locker", title: "Bind a ReserveLocker" },
    { slug: "supply-reserve", title: "Supply the reserve" },
    { slug: "qualification", title: "Track qualification" },
    { slug: "draw", title: "Draw" },
    { slug: "repay", title: "Repay" },
    { slug: "release", title: "Release the reserve" },
    { slug: "confirm-state", title: "Confirm authoritative state" },
  ] },
  { id: "integrate", label: "INTEGRATE", pages: [
    { slug: "frontend", title: "Frontend integration" },
    { slug: "proof-worker", title: "Proof worker" },
    { slug: "job-lifecycle", title: "Job lifecycle" },
    { slug: "wallet-network", title: "Wallet and network handling" },
    { slug: "evidence", title: "Evidence integration" },
  ] },
  { id: "reference", label: "REFERENCE", pages: [
    { slug: "verd-contract", title: "Verd contract" },
    { slug: "reserve-locker", title: "ReserveLocker contract" },
    { slug: "reserve-locker-factory", title: "ReserveLockerFactory" },
    { slug: "events", title: "Events" },
    { slug: "errors", title: "Errors" },
    { slug: "backend-api", title: "Backend API" },
    { slug: "deployments", title: "Deployments and addresses" },
    { slug: "facility-states", title: "Facility state model" },
  ] },
  { id: "evidence", label: "EVIDENCE", pages: [
    { slug: "current-deployment", title: "Current deployment" },
    { slug: "cross-chain-evidence", title: "Cross-chain evidence" },
    { slug: "worker-evidence", title: "Worker evidence" },
    { slug: "recorded-lifecycle", title: "Recorded lifecycle" },
  ] },
  { id: "security", label: "SECURITY", pages: [
    { slug: "trust-boundaries", title: "Trust model" },
    { slug: "secrets", title: "Key and secret boundaries" },
    { slug: "cross-chain-proof", title: "Cross-chain proof boundary" },
    { slug: "failure-replay", title: "Failure and replay behavior" },
  ] },
  { id: "help", label: "HELP", pages: [
    { slug: "troubleshooting", title: "Troubleshooting" },
    { slug: "faq", title: "FAQ" },
  ] },
];

const page = (section: string, slug: string, title: string, eyebrow: string, lead: string, toc: string[], blocks: DocBlock[]): DocsPage => ({ section, slug, title, eyebrow, lead, toc, blocks });

export const DOCS_PAGES: Record<string, DocsPage> = {
  "start/introduction": page("start", "introduction", "What Verd does.", "DOCS / LEARN VERD / WHAT VERD DOES", "Verd is a testnet working-capital product. A lender funds an agreement. A borrower can earn its preferred rate by locking the agreed WETH reserve until maturity.", ["The agreement", "The stated terms", "Why the rate changes", "The facility loop", "Current boundary"], [
    { kind: "callout", tone: "info", label: "IN ONE SENTENCE", text: "Verd lets a lender offer two rates upfront, then applies the lower rate to future interest when the borrower proves the agreed reserve condition." },
    { kind: "paragraph", text: "A facility is a fixed-term agreement with a principal, a standard APR, a preferred APR, a reserve amount, a qualification deadline, and a maturity date. The lender sets and funds those terms. The borrower decides whether to meet the reserve condition or use the standard path where the contract permits it." },
    { kind: "paragraph", text: "The reserve condition is specific. The borrower locks the agreed WETH amount in a facility-specific reserve locker until maturity. Verd checks the record and can then apply the preferred APR to future interest accrual. It is not a generic performance score, revenue score, or market prediction." },
    { kind: "steps", items: ["The lender agrees and funds the facility terms.", "The borrower reviews the standard and preferred rate, the reserve amount, and the dates.", "The borrower locks the required WETH reserve before the qualification deadline.", "Verd verifies the reserve record and updates the facility's preferred-rate state.", "The parties can inspect the facility, repay at maturity, and follow the separate reserve-release record." ] },
    { kind: "callout", tone: "warning", label: "CURRENT TESTNET BOUNDARY", text: "Verd is currently testnet-only and has no independent security audit. The facility contract and source-chain records are authoritative. The interface and proof worker explain state but do not replace those records." },
  ]),
  "start/quickstart": page("start", "quickstart", "Take the product tour.", "DOCS / LEARN VERD / PRODUCT TOUR", "You can understand the current testnet record without connecting a wallet. Wallet actions are explicit and appear only when the connected account has a valid role.", ["Start with the agreement", "Inspect a facility", "Connect only when ready"], [
    { kind: "steps", items: ["Start on the Verd home page to see the product promise, rate example, and lender and borrower paths.", "Open the recorded testnet facility to compare its principal, standard APR, preferred APR, reserve requirement, maturity, and current state.", "Read the Preferred Rate Condition and lifecycle before choosing an action.", "Open the evidence surface if you need the source transaction or proof details.", "Connect a compatible testnet wallet only when the workspace presents an action for your recorded role." ] },
    { kind: "paragraph", text: "The current facility is a recorded testnet example for inspection. It is not a live offer, a portfolio summary, or a prompt to send funds." },
    { kind: "callout", tone: "security", label: "WALLET SAFETY", text: "Verd never needs a seed phrase, private key, wallet password, or internal worker secret. A wallet can approve a specific testnet transaction or sign a short-lived borrower message when the product asks for it." },
  ]),
  "start/how-it-works": page("start", "how-it-works", "How the preferred rate works.", "DOCS / LEARN VERD / HOW THE RATE WORKS", "The rate change has one clear trigger: Verd must accept the agreed WETH reserve condition for the specific facility and borrower.", ["Who does what", "The facility loop", "Reserve-release boundary"], [
    { kind: "table", headers: ["Participant", "Does", "Gets clarity on"], rows: [
      ["Lender", "Sets and funds the facility terms", "How much is available, at what two rates, and until when"],
      ["Borrower", "Reviews the terms and locks the agreed WETH reserve if qualifying", "What reserve is required and what rate can apply"],
      ["Verd", "Records the facility state and verifies the condition", "Whether the preferred rate is active"],
      ["Reserve locker", "Holds the reserve position until its unlock time", "Which facility and borrower the reserve belongs to"],
    ] },
    { kind: "steps", items: ["The lender creates and funds a facility with two stated rates.", "The borrower checks the financial terms and dates.", "The borrower locks the required WETH reserve into the facility-specific locker.", "Verd validates the reserve record for the right facility, borrower, amount, and deadline.", "After that verification, future interest accrues at the preferred APR.", "At maturity, repayment and the reserve-release record remain separate steps that can be inspected." ] },
    { kind: "callout", tone: "warning", label: "RESERVE-RELEASE BOUNDARY", text: "The current ReserveLocker is time-based and borrower-authorized. It does not receive an automatic repayment signal from Creditcoin. Verd does not describe the Ethereum release as repayment-gated at the contract level." },
  ]),
  "start/worked-example": page("start", "worked-example", "A facility in practice.", "DOCS / LEARN VERD / A FACILITY IN PRACTICE", "A simple example makes the condition tangible. These are illustrative terms, not a live facility offer or a promise of a specific outcome.", ["Illustrative terms", "What the borrower chooses", "What changes", "Read the real terms"], [
    { kind: "table", headers: ["Term", "Illustrative value", "Meaning"], rows: [
      ["Principal", "100,000 tCTC", "The amount the lender agrees to make available for the fixed term"],
      ["Standard APR", "8.00%", "The rate used before the reserve condition is accepted"],
      ["Preferred APR", "5.00%", "The rate used for future interest after the condition is accepted"],
      ["Required reserve", "10 WETH", "The amount the borrower must lock in the facility-specific reserve path"],
      ["Qualification deadline", "A stated date before maturity", "The point by which Verd must accept the reserve condition"],
    ] },
    { kind: "paragraph", text: "The lender publishes both rates when creating the facility. The borrower can compare the cost of the standard path with the preferred-rate condition before taking any reserve action." },
    { kind: "steps", items: ["The lender funds the 100,000 tCTC facility.", "The borrower reviews the 8.00% standard APR, 5.00% preferred APR, required reserve, and dates.", "The borrower locks the agreed 10 WETH reserve before the qualification deadline.", "Verd verifies the facility-specific reserve record.", "Future interest moves to the 5.00% preferred APR after acceptance. Interest that accrued before acceptance stays at the earlier rate." ] },
    { kind: "callout", tone: "info", label: "READ THE REAL TERMS", text: "Every real facility has its own principal, dates, rates, and reserve threshold. Read the facility workspace and authoritative contract state before making a wallet decision." },
  ]),
  "start/roles": page("start", "roles", "Lenders and borrowers.", "DOCS / LEARN VERD / ROLES", "Verd has two primary roles. The same facility shows both parties the agreed terms and its current state, while only the recorded role can take its corresponding action.", ["Lender path", "Borrower path", "Shared record"], [
    { kind: "table", headers: ["Role", "Main job", "Key question before acting"], rows: [
      ["Lender", "Set and fund clear facility terms", "Are the principal, two APRs, reserve condition, deadline, and maturity acceptable?"],
      ["Borrower", "Review the terms and decide whether to qualify for the preferred rate", "Is locking the agreed WETH reserve worth the lower future rate?"],
    ] },
    { kind: "paragraph", text: "Lenders create the fixed-term facility and fund its stated principal. Borrowers do not negotiate through the interface. They inspect the recorded terms, then use the valid next action shown for that facility." },
    { kind: "paragraph", text: "The shared workspace shows the same financial facts to both roles: principal, standard and preferred APR, reserve requirement, dates, lifecycle, and inspectable evidence. Wallet controls stay role-aware so a user does not see an invalid transaction as their next step." },
  ]),
  "start/reserve-boundary": page("start", "reserve-boundary", "What the reserve does.", "DOCS / LEARN VERD / RESERVE BOUNDARY", "The WETH reserve qualifies the preferred rate. It is held through the facility's time boundary and is not presented as a generic balance or credit score.", ["What it proves", "What it does not prove", "Release timing"], [
    { kind: "paragraph", text: "Verd uses the reserve as a stated condition in one facility. The facility has a required WETH amount, a specific borrower, a specific reserve locker, and a deadline. Verd accepts the condition only after it checks those details." },
    { kind: "table", headers: ["The reserve can support", "The reserve does not automatically support"], rows: [
      ["A preferred-rate transition after the exact condition is accepted", "A generic credit score, revenue score, or portfolio health score"],
      ["An inspectable record of the agreed WETH lock", "An automatic Creditcoin repayment confirmation"],
      ["A time-based release record for the configured borrower", "A contract-level repayment-gated release"],
    ] },
    { kind: "callout", tone: "warning", label: "TIME-BASED RELEASE", text: "In the current testnet build, the reserve locker permits release at or after its unlock time by the configured borrower. It does not receive an automatic repayment signal from Creditcoin. Repayment and release must be read as separate records." },
  ]),
  "use/lender-journey": page("use", "lender-journey", "Lender journey.", "DOCS / USE VERD / LENDER JOURNEY", "A lender creates the agreement, chooses the two rates and reserve condition, funds the stated principal, then monitors the recorded facility state.", ["Before creating", "Create and fund", "Monitor"], [
    { kind: "bullets", items: ["Choose the borrower address and fixed principal.", "Set the standard APR and lower preferred APR.", "Set a required WETH reserve, qualification deadline, and maturity date.", "Review every field before a wallet transaction is requested." ] },
    { kind: "steps", items: ["Connect the lender wallet on Creditcoin Testnet CC3.", "Open a facility and enter the borrower and financial terms.", "Review the rate condition and create the facility.", "Fund the exact principal when the workspace shows funding as valid.", "Return to the workspace to inspect the condition, draw state, maturity, repayment, and evidence." ] },
    { kind: "callout", tone: "warning", label: "TESTNET ACTIONS", text: "The current flow uses testnet networks and assets. It must not be treated as production lending or as a request to transfer Mainnet funds." },
  ]),
  "use/borrower-journey": page("use", "borrower-journey", "Borrower journey.", "DOCS / USE VERD / BORROWER JOURNEY", "A borrower starts by reading the exact facility terms. The reserve action should happen only after the standard and preferred paths, dates, and required WETH amount are understood.", ["Review first", "Qualify for the rate", "Use the facility"], [
    { kind: "bullets", items: ["Check that the facility names your wallet as the borrower.", "Compare the standard APR and preferred APR.", "Check the required WETH reserve, qualification deadline, and maturity.", "Read the reserve-release boundary before you lock WETH." ] },
    { kind: "steps", items: ["Open the facility workspace and review the current condition state.", "When the workspace asks for the reserve action, switch to Ethereum Sepolia and follow the facility-specific flow.", "Wait for the source record and Verd's verification to complete.", "Read the facility state again to confirm whether the preferred rate is active.", "Draw, repay, and inspect reserve release only when each action is valid for the authoritative state." ] },
    { kind: "callout", tone: "security", label: "KEEP CONTROL OF YOUR WALLET", text: "The borrower wallet approves only the explicit testnet action being shown. Verd never asks for a seed phrase, private key, or a wallet password." },
  ]),
  "use/facility-states": page("use", "facility-states", "Facility states and next actions.", "DOCS / USE VERD / FACILITY STATES", "The workspace separates what has happened, what is waiting, and what the connected role can do next. It always reads the current facility record before presenting an action.", ["Read the state", "Typical next action", "When something fails"], [
    { kind: "table", headers: ["State", "What it means", "Typical next step"], rows: [
      ["Funding pending", "Terms exist but the lender has not funded the principal", "Lender reviews and funds the facility"],
      ["Awaiting borrower action", "The facility can move toward its rate condition", "Borrower reviews terms and the reserve requirement"],
      ["Qualification in progress", "A reserve action exists and verification is advancing", "Wait for verification or inspect the evidence"],
      ["Preferred Rate Condition active", "The facility accepts the reserve condition", "Review the preferred APR and the next facility action"],
      ["Matured or repayment pending", "The facility has reached its term boundary", "Read the outstanding state and the valid repayment path"],
      ["Complete", "The recorded lifecycle shows its final confirmed state", "Inspect evidence if needed"],
    ] },
    { kind: "paragraph", text: "A status never replaces the underlying contract read. If a transaction times out or a proof service is delayed, the workspace should show the last confirmed state and a safe retry or inspection path rather than asking the user to repeat a completed action." },
    { kind: "callout", tone: "warning", label: "SAFE RECOVERY", text: "Do not repeat a reserve action or a facility transaction just because the interface lost a response. Re-read the facility, source transaction, and job status first, then use the workspace's next safe action." },
  ]),
  "use/wallet-guide": page("use", "wallet-guide", "Wallet and testnet guidance.", "DOCS / USE VERD / WALLET GUIDANCE", "Verd keeps wallet actions behind a connected account and the correct testnet network. You can inspect public facility data without connecting a wallet.", ["Networks", "Before signing", "What Verd never asks for"], [
    { kind: "table", headers: ["Action", "Network", "Who usually performs it"], rows: [
      ["Create, fund, draw, or repay a facility", "Creditcoin Testnet CC3", "Recorded lender or borrower"],
      ["Create the reserve locker or lock WETH", "Ethereum Sepolia", "Recorded borrower"],
      ["Inspect terms, state, and evidence", "No wallet connection required", "Anyone"],
    ] },
    { kind: "bullets", items: ["Read the full action label, amount, network, and facility context before confirming a wallet prompt.", "Use testnet assets only in the current release.", "If the workspace asks you to switch networks, confirm that the action matches the facility step you intend to take.", "Re-read facility state after a transaction before starting another action." ] },
    { kind: "callout", tone: "security", label: "NEVER SHARE SECRETS", text: "Verd never asks for a seed phrase, private key, wallet password, or internal worker secret. Stop if a prompt requests any of them." },
  ]),
  "concepts/facilities": page("concepts", "facilities", "Facilities.", "DOCS / CONCEPTS / FACILITIES", "A facility is a fixed-term agreement between a lender and a borrower, recorded on Creditcoin.", ["Terms", "Roles", "Actions"], [
    { kind: "paragraph", text: "Each facility has a bytes32 identifier and stores the lender, borrower, principal, outstanding principal, standard APR, preferred APR, current APR, maturity, qualification deadline, required reserve, locker binding, and evidence fields." },
    { kind: "table", headers: ["Term", "Meaning"], rows: [
      ["Principal", "Native tCTC amount the lender commits."],
      ["Standard APR", "Rate used before qualification or when the standard path is selected."],
      ["Preferred APR", "Future rate available after the reserve condition is accepted."],
      ["Required reserve", "Exact WETH threshold supplied through the facility locker."],
      ["Qualification deadline", "Creditcoin timestamp by which source activity must be accepted."],
      ["Maturity", "Creditcoin timestamp after which draw is unavailable and repayment is due."],
    ] },
    { kind: "bullets", items: ["Only the recorded lender can fund the exact principal.", "Only the recorded borrower can draw and repay.", "A facility can bind one ReserveLocker, and a locker can bind one facility.", "Contract state is authoritative for rate, funding, draw, repayment, and release evidence." ] },
  ]),
  "concepts/preferred-rate-condition": page("concepts", "preferred-rate-condition", "Preferred Rate Condition.", "DOCS / CONCEPTS / PREFERRED RATE CONDITION", "The Preferred Rate Condition is the product term for the reserve-backed rate improvement.", ["What changes", "What proves it", "How it is shown"], [
    { kind: "paragraph", text: "The condition is satisfied only after Verd authenticates the facility-specific locker binding and the required Aave Supply receipt. Verd accrues the previous rate first, then applies the preferred APR prospectively." },
    { kind: "table", headers: ["State", "Interface meaning"], rows: [["Pending", "The reserve or proof path is incomplete."], ["In progress", "A source action or worker job is still advancing."], ["Active", "CC3 reads the preferred-rate flag and current APR."], ["Expired", "The qualification deadline has passed without an accepted condition."]] },
    { kind: "callout", tone: "info", label: "USER LANGUAGE", text: "The interface explains the financial consequence first. Proof identifiers, source blocks, and explorer records remain available in the evidence surface." },
  ]),
  "concepts/reserve-locker": page("concepts", "reserve-locker", "ReserveLocker.", "DOCS / CONCEPTS / RESERVELOCKER", "A ReserveLocker holds the resulting Aave aToken position for one facility until its unlock time.", ["Immutable configuration", "Release rules", "Factory binding"], [
    { kind: "bullets", items: ["Borrower address", "Approved Aave Pool", "Reserve asset and corresponding aToken", "Unlock time", "Facility ID through the factory mapping" ] },
    { kind: "paragraph", text: "The locker has no owner, admin withdrawal, upgrade path, arbitrary call path, or payable escape path. Before unlock, release is refused. At and after unlock, only the configured borrower can release the complete current aToken balance." },
    { kind: "callout", tone: "warning", label: "TIME-BASED RELEASE", text: "The Ethereum lock is independent of an automatic CC3 repayment signal. The product can sequence repayment before release, but the locker contract itself enforces time and borrower authorization." },
  ]),
  "concepts/lifecycle": page("concepts", "lifecycle", "Facility lifecycle.", "DOCS / CONCEPTS / FACILITY LIFECYCLE", "The workspace derives a single product journey from authoritative contract, worker, and source-chain evidence.", ["Lifecycle states", "Next action", "Completion"], [
    { kind: "steps", items: ["Draft and terms agreed", "Funding pending", "Awaiting borrower action", "Qualification in progress", "Preferred Rate Condition active", "Drawn or active", "Maturity and repayment", "Reserve releasable", "Complete" ] },
    { kind: "paragraph", text: "The implementation may derive several labels from smaller contract fields. It must never show a preferred rate without accepted proof, a released reserve before maturity, or a complete facility without repayment and release evidence." },
    { kind: "callout", tone: "info", label: "ONE WORKSPACE", text: "Users do not need separate Facility, Covenant, Proof, or ReserveLocker product areas. The role-aware workspace shows the current valid action in context." },
  ]),
  "concepts/rate-model": page("concepts", "rate-model", "Rate and interest model.", "DOCS / CONCEPTS / RATE MODEL", "Verd uses basis-point APRs and simple time-proportional interest for the fixed-term testnet facility.", ["Formula", "Accrual order", "Maturity"], [
    { kind: "code", language: "text", code: "interestDelta = outstandingPrincipal * currentRateBps * elapsed\n                 / (10,000 * 31,536,000)" },
    { kind: "bullets", items: ["APR values are stored in basis points, so 500 means 5.00%.", "Interest accrues before preferred-rate activation, repayment, and final settlement.", "The preferred rate changes future accrual only.", "Repayment equals outstanding principal plus accrued interest at or after maturity." ] },
    { kind: "callout", tone: "warning", label: "FIXED-TERM BOUNDARY", text: "The contract rejects draw at or after maturity. The interface calculates an estimate for user orientation, then the contract remains authoritative at submission." },
  ]),
  "concepts/proof-model": page("concepts", "proof-model", "Cross-chain proof model.", "DOCS / CONCEPTS / CROSS-CHAIN PROOF", "Attestcoin carries authenticated Ethereum evidence to Creditcoin without making the worker the source of truth.", ["Source receipt", "Validation", "Replay protection"], [
    { kind: "steps", items: ["Resolve the source transaction, block, and receipt.", "Confirm the source transaction succeeded and emitted the expected factory or Aave event.", "Wait for the source block to be attested.", "Generate and SDK-verify the current proof.", "Submit proof calldata to Verd.", "Read CC3 state and evidence after the transaction." ] },
    { kind: "bullets", items: ["Binding validates the approved factory, borrower, facility ID, Aave configuration, locker, and unlock time.", "Qualification validates the Aave Pool, WETH, borrower, locker, amount, referral code, success, deadline, and proof replay state.", "Proof identifiers are single-use." ] },
  ]),
  "concepts/trust-model": page("concepts", "trust-model", "Trust and data boundaries.", "DOCS / CONCEPTS / TRUST MODEL", "Each layer has a narrow responsibility and a clear source of truth.", ["Authority", "Operational data", "Evidence"], [
    { kind: "table", headers: ["Layer", "Authoritative for", "Not authoritative for"], rows: [["Creditcoin", "Facility state, rate, funding, draw, repayment, binding", "Ethereum receipt details"], ["Ethereum Sepolia", "ReserveLocker configuration, Aave receipt, aToken position, release", "Creditcoin repayment state"], ["Proof worker", "Job progress, retries, evidence references", "Facility balance or preferred rate"], ["Frontend", "Presentation and user actions", "Any protocol truth"]] },
    { kind: "callout", tone: "security", label: "FAIL CLOSED", text: "When a source, proof, or configuration check is invalid, Verd refuses the state transition and preserves the evidence needed for safe recovery." },
  ]),
  "build/prerequisites": page("build", "prerequisites", "Prerequisites.", "DOCS / BUILD / PREREQUISITES", "Prepare the tools, networks, and environment values before sending testnet transactions.", ["Tools", "Networks", "Secrets"], [
    { kind: "bullets", items: ["Node.js 20 or newer", "Foundry for contract builds and tests", "A compatible EVM wallet", "Sepolia ETH and WETH for the borrower test wallet", "Creditcoin Testnet tCTC for the lender and borrower actions" ] },
    { kind: "code", language: "shell", code: "npm ci\ncp .env.example .env\nnpm run typecheck\nnpm test" },
    { kind: "callout", tone: "security", label: "LOCAL CONFIGURATION", text: "Keep private keys, database URLs, worker secrets, and provider credentials in local environment configuration. Never paste or commit them." },
  ]),
  "build/deployments": page("build", "deployments", "Networks and deployments.", "DOCS / BUILD / NETWORKS", "Verd currently connects Ethereum Sepolia and Creditcoin Testnet CC3.", ["Creditcoin", "Sepolia", "Aave"], [
    { kind: "table", headers: ["Network", "Chain ID", "Native asset", "Explorer"], rows: [[CC3.name, String(CC3.chainId), CC3.currency.symbol, CC3.explorerUrl], [SEPOLIA.name, String(SEPOLIA.chainId), SEPOLIA.currency.symbol, SEPOLIA.explorerUrl]] },
    { kind: "bullets", items: [`Verd contract: ${VERIFIED_DEPLOYMENT.verdAddress}`, `ReserveLockerFactory: ${SEPOLIA.factory}`, `Aave Pool: ${SEPOLIA.aavePool}`, `Sepolia WETH: ${SEPOLIA.weth}`] },
    { kind: "callout", tone: "warning", label: "TESTNET ONLY", text: "These addresses are testnet deployment evidence. They are not Mainnet configuration and must not be presented as production endpoints." },
  ]),
  "build/create-facility": page("build", "create-facility", "Create a facility.", "DOCS / BUILD / CREATE A FACILITY", "The lender creates the terms that the borrower will review and either qualify for or draw at the standard rate when allowed.", ["Required terms", "Wallet action", "Readback"], [
    { kind: "table", headers: ["Input", "Contract value"], rows: [["Borrower", "Creditcoin EVM address"], ["Principal", "Native tCTC amount"], ["Standard APR", "Basis points"], ["Preferred APR", "Basis points"], ["Maturity", "Creditcoin timestamp"], ["Qualification deadline", "Creditcoin timestamp on or before maturity"], ["Required reserve", "WETH amount"]] },
    { kind: "steps", items: ["Connect the lender wallet and switch to CC3.", "Review the borrower and every term in the three-step form.", "Submit createFacility with a new bytes32 facility ID.", "Wait for the transaction, then open the returned facility route.", "Read the facility back from CC3 before taking another action." ] },
    { kind: "callout", tone: "info", label: "NO CROSS-CHAIN CALL", text: "Facility creation stores terms on Creditcoin. Locker creation and reserve supply happen later on Sepolia." },
  ]),
  "build/bind-locker": page("build", "bind-locker", "Bind a ReserveLocker.", "DOCS / BUILD / BIND A LOCKER", "Binding authenticates the borrower-created Sepolia locker to exactly one CC3 facility.", ["Create", "Prove", "Bind"], [
    { kind: "steps", items: ["Connect the recorded borrower wallet and switch to Sepolia.", "Call ReserveLockerFactory.createReserveLocker with the facility ID and maturity-compatible unlock time.", "Copy the factory transaction hash and optional source block into the facility workspace.", "Sign the borrower-authenticated binding registration.", "The worker validates the factory event and produces the proof.", "Verd submits bindReserveLocker and reads back the binding proof and locker address." ] },
    { kind: "callout", tone: "warning", label: "ONE LOCKER", text: "The factory mapping and CC3 contract both prevent the same facility or locker from being rebound to a different address." },
  ]),
  "build/supply-reserve": page("build", "supply-reserve", "Supply the reserve.", "DOCS / BUILD / SUPPLY THE RESERVE", "The borrower supplies the exact WETH reserve through the authenticated locker before qualification.", ["Approval", "Supply", "Source record"], [
    { kind: "steps", items: ["Switch the wallet to Ethereum Sepolia.", "Approve the Aave Pool to spend the required WETH if the existing allowance is insufficient.", "Call Aave V3 supply with WETH, the required amount, the facility locker as onBehalfOf, and referral code zero.", "Wait for the receipt and record the source transaction hash.", "Register the source transaction for qualification with a borrower signature." ] },
    { kind: "callout", tone: "security", label: "EXACT FIELDS", text: "Qualification checks the Aave Pool emitter, WETH asset, borrower, locker, amount, onBehalfOf, success, deadline, and replay state. A wallet balance alone never proves qualification." },
  ]),
  "build/qualification": page("build", "qualification", "Track qualification.", "DOCS / BUILD / TRACK QUALIFICATION", "The worker handles attestation and proof progression while the workspace polls a public, borrower-authenticated job record.", ["Register", "Progress", "Confirm"], [
    { kind: "code", language: "http", code: "POST /public/qualification-jobs\nGET  /job-status/:jobId" },
    { kind: "steps", items: ["Sign the job message with the recorded borrower wallet.", "The worker verifies signer, facility borrower, operation, source receipt, and deadline.", "The worker waits for attestation and generates an SDK-verified proof.", "The worker submits the proof with a durable nonce and checks the existing CC3 state before retrying.", "The workspace shows Preferred Rate Condition active only after authoritative CC3 readback." ] },
  ]),
  "build/draw": page("build", "draw", "Draw.", "DOCS / BUILD / DRAW", "A borrower draws a funded facility before maturity, at the current rate returned by CC3.", ["Conditions", "Transaction", "Readback"], [
    { kind: "bullets", items: ["The facility must be funded.", "The connected wallet must match the borrower.", "The current timestamp must be before maturity.", "The draw can happen once.", "The preferred rate applies only when the condition is active onchain." ] },
    { kind: "steps", items: ["Connect the borrower wallet and switch to CC3.", "Review standard APR, preferred APR, current APR, outstanding amount, and maturity.", "Submit drawFacility for the facility ID.", "Wait for confirmation and refresh the workspace." ] },
  ]),
  "build/repay": page("build", "repay", "Repay.", "DOCS / BUILD / REPAY", "Repayment closes the CC3 debt after maturity when the sent amount equals outstanding principal plus accrued interest.", ["Estimate", "Submit", "Confirm"], [
    { kind: "paragraph", text: "The interface presents an estimate from the last accrual timestamp, current APR, outstanding principal, and the fixed 365-day year. The contract recalculates the amount at submission and remains authoritative." },
    { kind: "steps", items: ["Connect the borrower wallet and switch to CC3.", "Wait until maturity.", "Review the current repayment estimate.", "Submit repayFacility with the exact contract-required value.", "Read back repaid state and repayment evidence." ] },
    { kind: "callout", tone: "warning", label: "NO EARLY REPAYMENT CLAIM", text: "The current fixed-term contract rejects repayment before maturity. Testnet evidence for a complete post-maturity release loop is still a separate verification gate." },
  ]),
  "build/release": page("build", "release", "Release the reserve.", "DOCS / BUILD / RELEASE THE RESERVE", "The borrower releases the aToken position from the locker after the immutable time boundary.", ["Before release", "Release", "Completion"], [
    { kind: "bullets", items: ["The locker must have reached its unlock time.", "The caller must be the configured borrower.", "The locker balance must be nonzero.", "The release transfers the complete current aToken balance." ] },
    { kind: "callout", tone: "warning", label: "CURRENT PRODUCT BOUNDARY", text: "ReserveLocker release is time-based and independent of an automatic repayment signal. The product can ask the borrower to repay first, but it cannot claim protocol-enforced repayment gating until a separate cross-chain feature exists." },
  ]),
  "build/confirm-state": page("build", "confirm-state", "Confirm authoritative state.", "DOCS / BUILD / CONFIRM STATE", "Use contract reads, receipts, event logs, and explorer records to confirm each transition.", ["CC3 reads", "Sepolia reads", "Evidence"], [
    { kind: "table", headers: ["Question", "Authoritative read"], rows: [["Does the facility exist?", "facilityExists and getFacility"], ["Is it funded or drawn?", "getFacilityStatus"], ["Is the preferred condition active?", "facilityState and getFacilityStatus"], ["Is the locker bound?", "getFacilityLockerBinding"], ["Was the source action accepted?", "Sepolia receipt and decoded event"], ["Was the proof processed?", "Proof ID and CC3 evidence fields"]] },
    { kind: "callout", tone: "info", label: "EVIDENCE ORDER", text: "Product explanation comes first, current state second, real execution third, and raw protocol records last." },
  ]),
  "integrate/frontend": page("integrate", "frontend", "Frontend integration.", "DOCS / INTEGRATE / FRONTEND", "The interface binds the approved Swiss-editorial system to real chain state without creating a second source of truth.", ["Read", "Act", "Recover"], [
    { kind: "bullets", items: ["Read facilities from CC3 with deterministic provider calls.", "Gate writes behind explicit wallet connection and network switching.", "Show one valid dominant action for the current lifecycle state.", "Poll worker status without exposing internal secrets.", "Keep proof details in an evidence drawer rather than leading with infrastructure." ] },
    { kind: "code", language: "text", code: "CC3 reads -> workspace state -> valid action\nSepolia source -> signed job -> worker status\nreceipt + proof -> authoritative readback -> evidence" },
    { kind: "callout", tone: "security", label: "UI BOUNDARY", text: "A local loading state, optimistic transaction, or worker row cannot be presented as confirmed financial state until the authoritative source has been read again." },
  ]),
  "integrate/proof-worker": page("integrate", "proof-worker", "Proof worker.", "DOCS / INTEGRATE / PROOF WORKER", "The worker is a resumable operational service for source receipt handling, Attestcoin progression, proof submission, and readback.", ["Inputs", "State", "Storage"], [
    { kind: "bullets", items: ["Public registration accepts a borrower signature for qualification or binding.", "Internal registration and wake calls require the worker secret.", "The worker validates source receipts before proof generation.", "Submission intent and nonces are durable so a restart cannot blindly duplicate a transaction.", "Postgres stores metadata only. Creditcoin and Ethereum remain authoritative." ] },
    { kind: "callout", tone: "warning", label: "DEPLOYMENT STATUS", text: "The worker is testnet infrastructure. Check the service health and root endpoint before relying on a public job-registration route." },
  ]),
  "integrate/job-lifecycle": page("integrate", "job-lifecycle", "Job lifecycle.", "DOCS / INTEGRATE / JOB LIFECYCLE", "Each job advances one safe step at a time and can resume from durable state.", ["Statuses", "Retries", "Terminal errors"], [
    { kind: "table", headers: ["Status", "Meaning"], rows: [["source_pending", "Waiting for a mined source receipt"], ["attestation_pending", "Waiting for the source block to be attested"], ["proof_generation_pending", "Building the current proof"], ["proof_ready", "Proof exists and is ready for submission"], ["cc3_submission_pending", "Submitting or reconciling the CC3 transaction"], ["completed", "Authoritative state confirms the requested operation"], ["manual_review", "A terminal or ambiguous condition needs review"]] },
    { kind: "bullets", items: ["Retryable infrastructure errors preserve the source transaction and resume state.", "Terminal validation errors do not invite a blind repeat.", "Every retry re-reads chain state before submitting again." ] },
  ]),
  "integrate/wallet-network": page("integrate", "wallet-network", "Wallet and network handling.", "DOCS / INTEGRATE / WALLET AND NETWORK", "Wallet actions are explicit, role-aware, and tied to the network that owns the next transaction.", ["CC3 actions", "Sepolia actions", "Signatures"], [
    { kind: "table", headers: ["Action", "Network", "Role"], rows: [["Create, fund, draw, repay", "Creditcoin CC3", "Lender or borrower as recorded"], ["Create locker, approve WETH, supply Aave", "Ethereum Sepolia", "Borrower"], ["Register binding or qualification job", "Wallet signature, then CC3 worker path", "Borrower"]] },
    { kind: "callout", tone: "security", label: "SIGNATURE SCOPE", text: "The signed message contains the operation, facility, source transaction, optional source block, and issue time. The worker checks the signer against the facility borrower and rejects expired messages." },
  ]),
  "integrate/evidence": page("integrate", "evidence", "Evidence integration.", "DOCS / INTEGRATE / EVIDENCE", "Evidence is a confidence surface built from external records, not a decorative log.", ["Display", "Link", "Boundary"], [
    { kind: "bullets", items: ["Facility identity and current contract reads", "Factory creation receipt and ReserveLocker event", "Locker binding proof and CC3 transaction", "Aave Supply receipt, block, decoded fields, and aToken balance", "Qualification proof, CC3 submission, and final rate state", "Draw, repayment, and release records when they exist" ] },
    { kind: "callout", tone: "info", label: "AVAILABILITY", text: "When a record is not available, the interface says unavailable or pending. It never fills a missing proof or transaction with sample content." },
  ]),
  "reference/verd-contract": page("reference", "verd-contract", "Verd contract.", "DOCS / REFERENCE / VERD CONTRACT", "Verd.sol records the facility terms, lifecycle, binding, rate, interest, proof, and repayment state on Creditcoin.", ["Reads", "Writes", "Invariants"], [
    { kind: "bullets", items: ["facilityExists, facilityState, getFacility, getFacilityStatus, getFacilityProof, getFacilityLockerBinding, getFacilityFinancials", "createFacility, fundFacility, drawFacility, accrueInterest, bindReserveLocker, repayFacility", "Preferred APR changes only after proof-backed condition activation", "Proof identifiers and locker bindings are single-use" ] },
    { kind: "callout", tone: "security", label: "CONTRACT AUTHORITY", text: "The frontend can suggest an action, but only the contract can change the facility state. Always read back after a transaction." },
  ]),
  "reference/reserve-locker": page("reference", "reserve-locker", "ReserveLocker contract.", "DOCS / REFERENCE / RESERVELOCKER", "ReserveLocker.sol is a small, immutable, time-locked holder for the Aave aToken position.", ["Stored values", "Release", "Forbidden paths"], [
    { kind: "bullets", items: ["borrower, aavePool, reserveAsset, aToken, unlockTime", "aTokenBalance and immutable configuration getters", "release() after unlock time, borrower-only, complete balance" ] },
    { kind: "bullets", items: ["No owner or mutable admin", "No arbitrary call or delegatecall", "No payable fallback", "No pre-maturity transfer path", "No upgrade path in the current testnet build" ] },
  ]),
  "reference/reserve-locker-factory": page("reference", "reserve-locker-factory", "ReserveLockerFactory.", "DOCS / REFERENCE / RESERVELOCKERFACTORY", "The factory creates one configured locker for one facility and emits the source event used for binding.", ["Create", "Event", "Validation"], [
    { kind: "code", language: "solidity", code: "createReserveLocker(\n  bytes32 facilityId,\n  address borrower,\n  uint64 unlockTime\n) returns (address lockerAddress)" },
    { kind: "bullets", items: ["Only the recorded borrower may create the locker.", "The facility ID cannot be empty or reused.", "The unlock time must be later than deployment and compatible with facility maturity.", "ReserveLockerCreated records the facility, locker, borrower, Aave Pool, WETH, aWETH, and unlock time." ] },
  ]),
  "reference/events": page("reference", "events", "Events.", "DOCS / REFERENCE / EVENTS", "Events make lifecycle transitions inspectable across the two execution domains.", ["Creditcoin", "Ethereum", "Evidence use"], [
    { kind: "table", headers: ["Contract", "Events"], rows: [["Verd", "FacilityCreated, ReserveLockerBound, FacilityFunded, FacilityDrawn, InterestAccrued, PreferredRateConditionActivated, FacilityRepaid"], ["ReserveLocker", "ReserveReleased"], ["ReserveLockerFactory", "ReserveLockerCreated"]] },
    { kind: "paragraph", text: "The UI links to explorer records when a transaction hash is available. An event proves only the fields it contains and must be combined with the relevant state read." },
  ]),
  "reference/errors": page("reference", "errors", "Errors.", "DOCS / REFERENCE / ERRORS", "User-facing errors explain the next safe action while preserving the contract boundary.", ["Common errors", "Worker errors", "Recovery"], [
    { kind: "table", headers: ["Condition", "User action"], rows: [["Wrong network", "Switch to the network named by the action"], ["Wrong role", "Connect the lender or borrower recorded on the facility"], ["Qualification deadline expired", "Do not repeat the source transaction; review the facility terms"], ["Source receipt invalid", "Inspect the source transaction and correct the input"], ["Proof already processed", "Refresh authoritative state; do not resubmit"], ["Worker timeout", "Wait or retry from the preserved job state"]] },
    { kind: "callout", tone: "warning", label: "NO BLIND RETRY", text: "A failed or ambiguous worker step must read existing source and destination state before another transaction is sent." },
  ]),
  "reference/backend-api": page("reference", "backend-api", "Backend API.", "DOCS / REFERENCE / BACKEND API", "The worker exposes a small public status surface and protected internal controls.", ["Public routes", "Internal routes", "Response boundary"], [
    { kind: "table", headers: ["Method", "Route", "Auth"], rows: [["GET", "/health or /healthz", "None"], ["POST", "/public/qualification-jobs", "Borrower wallet signature"], ["GET", "/job-status/:jobId", "None for status read"], ["POST", "/qualification-jobs or /jobs", "Internal secret"], ["POST", "/internal/tick", "Internal secret"]] },
    { kind: "code", language: "json", code: "{\n  \"operation\": \"qualification\",\n  \"facilityId\": \"0x...\",\n  \"sourceTxHash\": \"0x...\",\n  \"sourceBlock\": 11622931,\n  \"walletAddress\": \"0x...\",\n  \"signature\": \"0x...\",\n  \"issuedAt\": 0\n}" },
    { kind: "callout", tone: "security", label: "CORS AND SECRETS", text: "The public route supports browser registration with CORS. Internal tick and internal registration remain secret-protected. The internal secret must never appear in a browser request." },
  ]),
  "reference/deployments": page("reference", "deployments", "Deployments and addresses.", "DOCS / REFERENCE / DEPLOYMENTS", "These are the currently recorded testnet addresses used by the interface.", ["Creditcoin", "Sepolia", "External service"], [
    { kind: "table", headers: ["Resource", "Address or URL"], rows: [["Verd on CC3", VERIFIED_DEPLOYMENT.verdAddress], ["ReserveLockerFactory", SEPOLIA.factory], ["Aave Pool", SEPOLIA.aavePool], ["Sepolia WETH", SEPOLIA.weth], ["Worker", VERIFIED_DEPLOYMENT.workerUrl]] },
    { kind: "callout", tone: "warning", label: "STATUS", text: "Worker capabilities are deployment-specific. Check the service health and root endpoint before using public job registration." },
  ]),
  "reference/facility-states": page("reference", "facility-states", "Facility state model.", "DOCS / REFERENCE / FACILITY STATES", "The contract exposes a compact numeric state while the interface presents readable product labels.", ["Labels", "Derivation", "Impossible states"], [
    { kind: "table", headers: ["Index", "Label"], rows: ["Draft", "Funding pending", "Awaiting borrower action", "Qualification in progress", "Preferred Rate Condition active", "Drawn standard", "Drawn preferred", "Active", "Qualification expired", "Matured", "Repayment pending", "Repaid", "Reserve releasable", "Complete", "Failed with recovery required"].map((label, index) => [String(index), label]) },
    { kind: "bullets", items: ["Derive labels from authoritative contract fields and worker status.", "Keep loading, unavailable, pending, and confirmed distinct.", "Never show complete without repayment and release evidence.", "Never show preferred active without the proof-backed state." ] },
  ]),
  "evidence/current-deployment": page("evidence", "current-deployment", "Current deployment.", "DOCS / EVIDENCE / CURRENT DEPLOYMENT", "Verd's current interface reads the recorded CC3 deployment and testnet evidence directly.", ["Contract", "Facility", "Worker boundary"], [
    { kind: "bullets", items: [`Verd: ${VERIFIED_DEPLOYMENT.verdAddress}`, `Reference facility: ${VERIFIED_DEPLOYMENT.facilityId}`, `CC3 chain ID: ${CC3.chainId}`, `Sepolia chain ID: ${SEPOLIA.chainId}`] },
    { kind: "paragraph", text: "The reference facility reads as a funded, preferred-rate facility that matured without being drawn. The workspace shows that contract boundary directly and does not offer an invalid draw transaction." },
    { kind: "callout", tone: "warning", label: "LIVE BOUNDARY", text: "The frontend and worker changes in this checkout are local until a new backend deployment is published and its public routes are rechecked." },
  ]),
  "evidence/cross-chain-evidence": page("evidence", "cross-chain-evidence", "Cross-chain evidence.", "DOCS / EVIDENCE / CROSS-CHAIN", "The recorded reference facility has source and destination records for the locker binding and WETH reserve.", ["Locker binding", "Aave reserve", "Qualification"], [
    { kind: "table", headers: ["Record", "Transaction or block", "What it supports"], rows: [["Locker creation", "Sepolia block 11622889", "Factory event and immutable locker configuration"], ["Locker binding", VERIFIED_EVIDENCE.lockerBindingTx, "CC3 binding proof and facility association"], ["Aave Supply", VERIFIED_EVIDENCE.reserveSupplyTx, "Exact WETH supply to the authenticated locker"], ["Qualification", VERIFIED_EVIDENCE.qualificationTx, "Preferred Rate Condition activation"], ["Qualification source", "Sepolia block 11622931", "Source receipt and Aave event" ]] },
    { kind: "paragraph", text: "Inspect the external transaction records before relying on a proof claim. A proof identifier supports the verifier input and processing record, while the final facility state still comes from CC3." },
  ]),
  "evidence/worker-evidence": page("evidence", "worker-evidence", "Worker evidence.", "DOCS / EVIDENCE / WORKER", "Worker records explain progress and recovery without replacing chain state.", ["Durable metadata", "Recovery", "Current boundary"], [
    { kind: "bullets", items: ["Facility ID and source transaction form the idempotency key.", "Source block, receipt status, proof ID, submission nonce, transaction hash, retry count, and error category are persisted when available.", "A restart resumes from the last safe state and checks destination state before retrying.", "Public status returns progress, next action, and evidence identifiers without exposing the internal secret." ] },
    { kind: "callout", tone: "warning", label: "NO AUTONOMOUS CLAIM", text: "Unless an external scheduler is configured and verified, active browser polling is the only progression trigger that can be claimed for the product demo." },
  ]),
  "evidence/recorded-lifecycle": page("evidence", "recorded-lifecycle", "Recorded lifecycle.", "DOCS / EVIDENCE / RECORDED LIFECYCLE", "The current record proves the facility, reserve, binding, and preferred-rate state. It does not prove every future lifecycle step.", ["Proven", "Open", "How to read it"], [
    { kind: "table", headers: ["Area", "Current record"], rows: [["Facility", "Created and funded on CC3"], ["Reserve", "WETH supplied to the configured Sepolia locker"], ["Binding", "Factory event authenticated and bound on CC3"], ["Preferred rate", "Active in CC3 state"], ["Draw", "Not completed for the reference facility"], ["Repayment and release", "Not represented as complete in the current record"]] },
    { kind: "callout", tone: "info", label: "TRUTHFUL STATUS", text: "Documentation distinguishes confirmed external records, local implementation coverage, and open lifecycle evidence. It does not turn a test record into a production claim." },
  ]),
  "security/trust-boundaries": page("security", "trust-boundaries", "Trust model.", "DOCS / SECURITY / TRUST MODEL", "Verd is safest when every component stays within its declared authority.", ["Authorities", "Threats", "Controls"], [
    { kind: "table", headers: ["Threat", "Control"], rows: [["Wrong borrower", "Signer and contract borrower checks"], ["Wrong locker", "Factory event and immutable configuration validation"], ["Wrong asset or pool", "Approved Aave address checks"], ["Replayed proof", "Single-use proof identifiers"], ["Duplicate transaction after restart", "Durable submission intent and nonce reconciliation"], ["Fake UI success", "Authoritative readback before confirmation"]] },
  ]),
  "security/secrets": page("security", "secrets", "Key and secret boundaries.", "DOCS / SECURITY / SECRETS", "Wallet signatures and server secrets have different jobs and must remain separate.", ["Browser", "Worker", "Repository"], [
    { kind: "bullets", items: ["The browser may request a wallet signature and submit a public registration payload.", "The worker secret authorizes internal registration and wake calls only.", "Private keys belong in local or hosted secret configuration and never in source, docs, screenshots, or issue text.", "Database URLs and provider credentials follow the same rule." ] },
    { kind: "callout", tone: "security", label: "NEVER SHARE", text: "A privacy viewing key, wallet password, seed phrase, or account private key must never be requested or printed in the product workflow." },
  ]),
  "security/cross-chain-proof": page("security", "cross-chain-proof", "Cross-chain proof boundary.", "DOCS / SECURITY / CROSS-CHAIN PROOF", "The proof path validates a specific source receipt and carries only the fields required for the destination transition.", ["Source", "Verifier", "Business rule"], [
    { kind: "steps", items: ["Check source chain and receipt success.", "Check the expected emitter and event signature.", "Decode the borrower, locker, pool, asset, amount, and timing fields.", "Verify Attestcoin proof and replay state.", "Apply the rate or binding transition only after every check passes." ] },
    { kind: "callout", tone: "warning", label: "NO CUSTOM CRYPTO", text: "Use the current Attestcoin verifier, decoder, and proof-builder output. Do not replace the verified path with a custom Merkle, receipt, or RLP implementation." },
  ]),
  "security/failure-replay": page("security", "failure-replay", "Failure and replay behavior.", "DOCS / SECURITY / FAILURE AND REPLAY", "Verd fails closed on invalid evidence and resumes safely on transient infrastructure failure.", ["Retryable", "Terminal", "Recovery"], [
    { kind: "table", headers: ["Class", "Examples", "Behavior"], rows: [["Retryable", "RPC timeout, attestation pending, proof-builder timeout", "Preserve evidence and resume from the last safe state"], ["Ambiguous", "Submission response missing", "Read existing nonce, receipt, and contract state before retry"], ["Terminal", "Wrong borrower, wrong asset, reused proof, expired deadline", "Stop and explain the correction without a blind repeat"]] },
    { kind: "paragraph", text: "The browser should never ask a borrower to repeat a completed Aave supply just because proof submission timed out. The source transaction and job state remain the recovery anchor." },
  ]),
  "help/troubleshooting": page("help", "troubleshooting", "Troubleshooting.", "DOCS / HELP / TROUBLESHOOTING", "Use the current state and the requested network to find the next safe action.", ["Wallet", "Source transaction", "Worker"], [
    { kind: "table", headers: ["Symptom", "Check"], rows: [["Switch network button", "CC3 is required for facility actions, Sepolia for locker and Aave actions"], ["Facility not found", "Use the exact 32-byte facility ID from the CC3 deployment"], ["Locker pending", "Read the Sepolia factory mapping and confirm the borrower wallet"], ["Qualification pending", "Check source receipt, job status, and current deadline"], ["Data unavailable", "Retry the chain read and inspect the relevant RPC or explorer record"], ["Worker route returns 404", "The public deployment is older than the local worker implementation"]] },
  ]),
  "help/faq": page("help", "faq", "FAQ.", "DOCS / HELP / FAQ", "Short answers to the questions that affect a safe Verd integration.", ["Product", "Evidence", "Deployment"], [
    { kind: "table", headers: ["Question", "Answer"], rows: [["Is Verd Mainnet-ready?", "No. The current implementation is testnet-only and has no independent security audit."], ["Does the worker own financial truth?", "No. Creditcoin and Ethereum remain authoritative."], ["Can I draw after maturity?", "No. The contract rejects draws at or after maturity."], ["Is release repayment-gated in the locker?", "No. The current locker enforces borrower authorization and time, not a CC3 repayment signal."], ["Can I submit the internal worker secret from the browser?", "No. Public registration uses a short-lived borrower signature."], ["Where do I inspect proof details?", "Open the facility evidence surface and follow the external explorer links."]] },
  ]),
};

function pageMap(): Record<string, DocsPage> {
  const map = { ...DOCS_PAGES };
  for (const section of DOCS_SECTIONS) {
    for (const item of section.pages) {
      const key = `${section.id}/${item.slug}`;
      if (map[key]) continue;
      map[key] = page(section.id, item.slug, item.title, `DOCS / ${section.label.replace(" / ", " / ")} / ${item.title.toUpperCase()}`, `Reference material for ${item.title.toLowerCase()} in the Verd facility workflow.`, ["Overview", "Implementation", "Boundary"], [
        { kind: "paragraph", text: `This page documents ${item.title.toLowerCase()} as part of Verd's working-capital facility system.` },
        { kind: "bullets", items: ["Use authoritative contract reads and receipts for current state.", "Keep wallet actions explicit and role-aware.", "Use the evidence surface for external records and the repository reference for implementation detail." ] },
        { kind: "callout", tone: "info", label: "SOURCE OF TRUTH", text: "The repository implementation and current testnet deployment determine the exact behavior described here." },
      ]);
    }
  }
  return map;
}

const ALL_DOCS = pageMap();

function blockId(text: string) { return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

function RenderBlock({ block }: { block: DocBlock }) {
  if (block.kind === "paragraph") return <p>{block.text}</p>;
  if (block.kind === "bullets") return <ul>{block.items.map(item => <li key={item}>{item}</li>)}</ul>;
  if (block.kind === "steps") return <ol>{block.items.map(item => <li key={item}>{item}</li>)}</ol>;
  if (block.kind === "code") return <pre className="docs-code"><code data-language={block.language}>{block.code}</code></pre>;
  if (block.kind === "callout") return <div className={`docs-callout docs-callout-${block.tone}`}><span className="mono">{block.label}</span><p>{block.text}</p></div>;
  return <div className="docs-table-wrap"><table><thead><tr>{block.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map(row => <tr key={row.join("|")}>{row.map(cell => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function DocsSidebar({ current, open, onNavigate }: { current: string; open: boolean; onNavigate: () => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  return <aside className={`docs-nav${open ? " open" : ""}`}><label><span aria-hidden="true">⌕</span><input aria-label="Search documentation" placeholder="Search documentation" value={query} onChange={event => setQuery(event.target.value)} /></label>{DOCS_SECTIONS.map(section => { const pages = section.pages.filter(item => !normalized || item.title.toLowerCase().includes(normalized) || item.slug.includes(normalized)); if (!pages.length) return null; return <div key={section.id}><strong className="mono">{section.label}</strong>{pages.map(item => { const path = `${section.id}/${item.slug}`; return <Link onClick={onNavigate} className={path === current ? "active" : ""} to={`/docs/${path}`} key={path}>{item.title}</Link>; })}</div>; })}</aside>;
}

function DocsOnPage({ pageData }: { pageData: DocsPage }) {
  return <aside className="on-page"><span className="mono">ON THIS PAGE</span>{pageData.toc.map(item => <a href={`#${blockId(item)}`} key={item}>{item}</a>)}</aside>;
}

function DocsSections({ pageData }: { pageData: DocsPage }) {
  const groups = pageData.toc.map((heading, index) => ({ heading, blocks: index === pageData.toc.length - 1 ? pageData.blocks.slice(index) : pageData.blocks.slice(index, index + 1) }));
  return <>{groups.map(group => <section className="doc-section" key={group.heading}><h2 id={blockId(group.heading)}>{group.heading}</h2>{group.blocks.map((block, index) => <RenderBlock block={block} key={`${group.heading}-${index}`} />)}</section>)}</>;
}

export function DocsContent() {
  const params = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = params["*"] || "start/introduction";
  const pageData = ALL_DOCS[current] ?? ALL_DOCS["start/introduction"];
  const flatPages = DOCS_SECTIONS.flatMap(section => section.pages.map(item => ({ ...item, path: `${section.id}/${item.slug}` })));
  const currentIndex = flatPages.findIndex(item => item.path === `${pageData.section}/${pageData.slug}`);
  const previous = currentIndex > 0 ? flatPages[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < flatPages.length - 1 ? flatPages[currentIndex + 1] : undefined;
  return <div className="docs-shell"><button className="docs-mobile" aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>Browse documentation <span aria-hidden="true">{mobileOpen ? "×" : "⌄"}</span></button><DocsSidebar current={`${pageData.section}/${pageData.slug}`} open={mobileOpen} onNavigate={() => setMobileOpen(false)} /><article className="doc-content"><div className="doc-breadcrumb mono">{pageData.eyebrow}</div><h1>{pageData.title}</h1><p className="doc-lead">{pageData.lead}</p><DocsSections pageData={pageData} /><div className="doc-next">{previous ? <Link to={`/docs/${previous.path}`}>← {previous.title}</Link> : <Link to="/facilities">Open facilities →</Link>}{next ? <Link to={`/docs/${next.path}`}>{next.title} →</Link> : <Link to="/facilities">Open facilities →</Link>}</div></article><DocsOnPage pageData={pageData} /></div>;
}
