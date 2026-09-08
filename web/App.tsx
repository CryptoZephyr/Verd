import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router-dom";
import { LogoMark } from "./Logo";
import { FACILITY_STATE_LABELS, VERIFIED_DEPLOYMENT, VERIFIED_EVIDENCE, createFacility, createReserveLocker, drawFacility, estimateRepayment, explorerAddress, explorerTx, formatApr, formatCtc, formatDate, formatToken, fundFacility, hasAddress, hasProof, readQualificationJob, readReserveLocker, registerQualificationJob, releaseReserve, repayFacility, short, supplyReserve, type CreateFacilityTerms, type FacilityRecord } from "./data/verd";
import { useFacility } from "./hooks/useFacility";
import { useWallet } from "./hooks/useWallet";
import { DocsContent } from "./docs";

type Tone = "neutral" | "positive" | "warning" | "critical";
const Arrow = () => <span aria-hidden="true">↗</span>;

function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status status-${tone}`}><i />{children}</span>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const wallet = useWallet();
  return <><div className="topline"><span>VERD / FIXED-TERM WORKING-CAPITAL CREDIT</span><span>TESTNET / CC3 + SEPOLIA</span></div><header className="site-header"><Link className="wordmark" to="/" aria-label="Verd home"><LogoMark /> <span>Verd</span></Link><button className="menu-button" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button><nav className={open ? "open" : ""} onClick={() => setOpen(false)}><Link to="/#how-it-works">How it works</Link><Link to="/#for-lenders">For lenders</Link><Link to="/#for-borrowers">For borrowers</Link><NavLink to="/docs">Docs</NavLink><span className="network">CC3</span>{wallet.account && !wallet.correctNetwork ? <button className="button button-warning" onClick={wallet.switchNetwork}>Switch network</button> : <button className="button button-light" onClick={wallet.connect}>{wallet.accountLabel ?? "Connect wallet"}</button>}</nav>{wallet.error && <div className="wallet-error" role="status">{wallet.error}</div>}</header></>;
}

function Footer() {
  return <footer><div className="wordmark"><LogoMark /> <span>Verd</span></div><p>Fixed-term credit with a reserve-based preferred rate.</p><div><Link to="/docs">Learn how Verd works</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms and conditions</Link><a href="https://github.com/CryptoZephyr/Verd">View the source <Arrow /></a></div><small>VERD · CREDITCOIN · 2026</small></footer>;
}

function Shell({ children }: { children: ReactNode }) { return <div className="app-frame"><Header /><main>{children}</main><Footer /></div>; }

function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  return <Shell><section className="legal-page"><span className="mono">VERD / {privacy ? "PRIVACY" : "TERMS AND CONDITIONS"}</span><h1>{privacy ? "Privacy." : "Terms and conditions."}</h1>{privacy ? <><p className="legal-lead">Verd is a public testnet interface. You can inspect facility records without connecting a wallet. This page describes the current testnet privacy boundary.</p><section><h2>Public blockchain data</h2><p>Wallet addresses, contract state, and transactions on Creditcoin Testnet and Ethereum Sepolia are public blockchain records. Verd may show those public records when they are relevant to a facility or evidence view.</p></section><section><h2>Wallet connection</h2><p>A wallet connection happens through the wallet provider you choose. Verd never asks for a seed phrase, private key, wallet password, or internal worker secret.</p></section><section><h2>Current scope</h2><p>This notice covers the present testnet interface only. A production deployment needs an owner-approved privacy notice with its final data-processing and contact details.</p></section></> : <><p className="legal-lead">Verd is a testnet prototype for inspecting a fixed-term credit workflow. These terms describe the current testnet boundary and do not create a production lending offer.</p><section><h2>Testnet use</h2><p>Use only the supported testnet networks and testnet assets. Do not treat facility records, rates, reserve conditions, or proof status as financial advice, a credit offer, or a promise of production availability.</p></section><section><h2>Wallet actions</h2><p>Review the account, network, amount, and action before approving a wallet request. Each participant remains responsible for the transactions they choose to submit from their wallet.</p></section><section><h2>Product boundary</h2><p>Verd has no independent security audit and the current reserve release is time-based and borrower-authorized. Read the facility and evidence records before relying on any testnet state.</p></section></>}</section></Shell>;
}

const nodes = ["Facility", "Reserve", "Proof", "Preferred"];
function CovenantLine({ active = 2, labels }: { active?: number; labels?: string[] }) {
  return <div className="covenant-line" aria-label={`Lifecycle progress: ${active} of ${nodes.length} complete`}>{nodes.map((node, index) => <div className={`line-node ${index < active ? "complete" : index === active ? "current" : ""}`} key={node}><div className="node-label"><span>{node}</span><small>{labels?.[index] ?? (index < active ? "Complete" : index === active ? "In progress" : "Pending")}</small></div><i /></div>)}</div>;
}

function Home() {
  const { data: facility } = useFacility();
  const active = facility?.preferredRateActive ? 4 : facility && hasProof(facility.qualificationProofId) ? 3 : facility && hasAddress(facility.reserveLocker) ? 2 : 1;
  return <Shell>
    <section className="hero grid" id="overview"><div className="hero-kicker mono">FIXED-TERM WORKING-CAPITAL CREDIT</div><div className="hero-statement"><h1>Lower rates for a<br />proven reserve.</h1><h2>A lender sets fixed terms. When the borrower locks the agreed WETH reserve until maturity, Verd verifies it and applies the preferred rate to future interest.</h2><p>One facility, an explicit rate condition, and an inspectable record of what happened.</p><div className="actions"><a className="button button-dark" href="#how-it-works">See how the rate changes <Arrow /></a><Link className="button button-light" to="/create">Create a facility</Link></div></div><div className="signal-field"><div className="signal-dots" /><div className="signal-cut" /><span className="mono">AGREE TERMS<br />LOCK WETH<br />PREFERRED RATE</span></div></section>
    <section className="product-explainer" id="how-it-works"><div className="section-head"><span className="mono">HOW VERD WORKS</span><Link className="text-link" to="/docs/start/how-it-works">See how the rate changes <Arrow /></Link></div><h2>One facility. One reserve condition. A lower rate when it is met.</h2><p className="section-note">The Covenant Line follows the real path from agreed terms to a preferred borrowing rate. It is a financial workflow, not a score.</p><CovenantLine active={active} labels={["Terms agreed", facility && hasAddress(facility.reserveLocker) ? "WETH locked" : "Reserve pending", facility && hasProof(facility.qualificationProofId) ? "Reserve verified" : "Verification pending", facility?.preferredRateActive ? "Preferred rate active" : "Rate pending"]} /><div className="loop-copy"><article><span className="mono">LENDER</span><h3>Sets and funds the facility.</h3><p>Principal, standard rate, preferred rate, reserve amount, and dates are visible before the borrower acts.</p></article><article><span className="mono">BORROWER</span><h3>Locks the agreed WETH reserve.</h3><p>The reserve sits in the facility-specific locker through maturity and becomes the rate condition.</p></article><article><span className="mono">VERD</span><h3>Checks the reserve record.</h3><p>Once the condition is accepted on Creditcoin, future interest accrues at the preferred rate.</p></article></div></section>
    <section className="worked-example" id="rate-example"><div className="section-head"><span className="mono">A FACILITY IN PRACTICE</span><Link className="text-link" to="/docs/start/worked-example">See a worked rate example <Arrow /></Link></div><div className="example-grid"><div><h2>What changes when the reserve is verified?</h2><p>A facility can state its two rates upfront. The borrower sees the financial trade-off before choosing to qualify.</p></div><div className="example-rates"><div><span>STANDARD APR</span><strong>8.00%</strong><small>Before the condition is accepted</small></div><i aria-hidden="true">→</i><div className="preferred-rate"><span>PREFERRED APR</span><strong>5.00%</strong><small>For future interest after verification</small></div></div></div><div className="example-note"><span className="mono">ILLUSTRATIVE TERMS</span><p>A lender offers 100,000 tCTC until a fixed maturity. If the borrower locks the agreed 10 WETH reserve by the qualification deadline, Verd can move future interest from 8.00% to 5.00%. Actual terms and accrual always come from the facility contract.</p></div></section>
    <section className="role-paths"><div className="section-head"><span className="mono">CHOOSE YOUR PATH</span><Link className="text-link" to="/docs/start/roles">Choose a lender or borrower path <Arrow /></Link></div><div className="role-grid"><article id="for-lenders"><span className="mono">FOR LENDERS</span><h2>Set the price of working capital.</h2><p>Create a facility with clear principal, rates, reserve condition, qualification deadline, and maturity. Fund only after you have reviewed the terms.</p><Link className="text-link" to="/create">Set up lender terms <Arrow /></Link></article><article id="for-borrowers"><span className="mono">FOR BORROWERS</span><h2>Review terms before you lock a reserve.</h2><p>Compare the standard and preferred rate, confirm the WETH requirement, then follow the facility's current valid action.</p><Link className="text-link" to="/docs/use/borrower-journey">Follow the borrower path <Arrow /></Link></article></div></section>
    <section className="reserve-boundary"><div><span className="mono">RESERVE BOUNDARY</span><h2>The reserve qualifies the rate. It does not automatically prove repayment.</h2></div><p>The current testnet ReserveLocker releases on time and with borrower authorization. It does not receive a repayment signal from Creditcoin, so Verd presents repayment and reserve release as separate, inspectable steps.</p><Link className="text-link" to="/docs/start/reserve-boundary">See what the reserve proves <Arrow /></Link></section>
    <section className="featured"><div className="section-head"><span className="mono">RECORDED TESTNET FACILITY</span><Link className="text-link" to="/facilities">Open the recorded facility <Arrow /></Link></div><p className="section-note">One recorded testnet facility for inspecting terms, condition state, and evidence. It is not an offer or a portfolio view.</p><Link to={`/facilities/${VERIFIED_DEPLOYMENT.facilityId}`} className="featured-row"><strong>Working Capital Facility</strong><span><small>PRINCIPAL</small>{facility ? formatCtc(facility.principal) : "Reading CC3"}</span><span><small>CURRENT APR</small><b className="green">{facility ? formatApr(facility.currentAprBps) : "Unavailable"}</b></span><Status tone={facility?.preferredRateActive ? "positive" : "neutral"}>{facility ? FACILITY_STATE_LABELS[facility.state] : "Loading"}</Status><Arrow /></Link></section>
  </Shell>;
}

function Facilities() {
  const { data: facility, loading, error, refresh } = useFacility();
  return <Shell><section className="page-head grid"><div><span className="mono">RECORDED FACILITY / CREDITCOIN TESTNET</span><h1>Inspect terms before any wallet action.</h1><p>This page shows the current onchain record. Open the workspace to review the rate condition, lifecycle, and evidence for the facility.</p></div><Link className="button button-dark" to="/create">Create facility terms</Link></section><section className="summary-strip"><div><span>Recorded principal</span><strong>{facility ? formatCtc(facility.principal) : "Unavailable"}</strong></div><div><span>Preferred rate condition</span><strong>{facility?.preferredRateActive ? "Active" : "Pending"}</strong></div><div><span>Record status</span><strong>{facility ? FACILITY_STATE_LABELS[facility.state] : "Unavailable"}</strong></div></section><section className="facility-list"><div className="table-head mono"><span>FACILITY</span><span>COUNTERPARTY</span><span>PRINCIPAL</span><span>CURRENT APR</span><span>STATE</span><span /></div>{loading && <div className="chain-notice">Reading the recorded deployment from CC3...</div>}{error && <div className="chain-notice chain-error"><span>{error}</span><button className="text-link" onClick={refresh}>Retry</button></div>}{facility && <Link to={`/facilities/${VERIFIED_DEPLOYMENT.facilityId}`} className="facility-row"><span className="facility-id mono">{short(facility.id)}</span><span><strong>{short(facility.borrower)}</strong><small>Borrower</small></span><span>{formatCtc(facility.principal)}</span><span className={facility.preferredRateActive ? "green" : ""}>{formatApr(facility.currentAprBps)}</span><Status tone={facility.preferredRateActive ? "positive" : "neutral"}>{FACILITY_STATE_LABELS[facility.state]}</Status><span className="row-action">Open facility record →</span></Link>}</section></Shell>;
}

type TermsKey = keyof CreateFacilityTerms;
function Field({ label, name, value, onChange, hint, type = "text", suffix }: { label: string; name: TermsKey; value: string; onChange: (name: TermsKey, value: string) => void; hint?: string; type?: string; suffix?: string }) {
  return <label className="field"><span>{label}</span><div><input name={name} type={type} value={value} required onChange={event => onChange(name, event.target.value)} />{suffix && <b>{suffix}</b>}</div>{hint && <small>{hint}</small>}</label>;
}

function CreateFacility() {
  const wallet = useWallet();
  const [step, setStep] = useState(1);
  const [terms, setTerms] = useState<CreateFacilityTerms>({ borrower: "", principal: "", standardApr: "", preferredApr: "", maturity: "", qualificationDeadline: "", requiredReserve: "" });
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ facilityId: string; transactionHash: string }>();
  const [formError, setFormError] = useState<string>();
  const update = (name: TermsKey, value: string) => setTerms(current => ({ ...current, [name]: value }));
  const next = () => {
    setFormError(undefined);
    if (step === 1 && !/^0x[a-fA-F0-9]{40}$/.test(terms.borrower)) return setFormError("Enter a complete Creditcoin borrower address.");
    if (step === 2 && (!terms.principal || !terms.standardApr || !terms.preferredApr || !terms.maturity || !terms.qualificationDeadline)) return setFormError("Complete every financial term before continuing.");
    if (step === 2 && Number(terms.principal) <= 0) return setFormError("Enter a principal greater than zero.");
    if (step === 2 && Number(terms.standardApr) <= Number(terms.preferredApr)) return setFormError("The preferred APR must be lower than the standard APR.");
    if (step === 2 && new Date(`${terms.qualificationDeadline}T23:59:59Z`) > new Date(`${terms.maturity}T23:59:59Z`)) return setFormError("The qualification deadline must be on or before maturity.");
    setStep(current => Math.min(3, current + 1));
  };
  const submit = async () => {
    setFormError(undefined);
    if (!reviewed || !terms.requiredReserve || Number(terms.requiredReserve) <= 0) return setFormError("Enter a WETH reserve greater than zero and confirm the terms.");
    if (!wallet.account) return wallet.connect();
    if (!wallet.correctNetwork) return wallet.switchNetwork();
    setPending(true);
    try { setResult(await createFacility(terms)); }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : "The facility transaction wasn’t submitted."); }
    finally { setPending(false); }
  };
  return <Shell><section className="create-shell"><aside className="create-aside"><span className="mono">CREATE FACILITY</span><h1>Set clear terms for working capital.</h1><ol>{["Counterparties", "Financial terms", "Condition and review"].map((item, index) => <li className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol></aside><section className="form-panel">
    <div className="form-wallet"><div><Status tone={wallet.account ? "positive" : "neutral"}>{wallet.account ? `Lender wallet ${wallet.accountLabel}` : "Lender wallet not connected"}</Status><small>{wallet.account ? wallet.correctNetwork ? "CC3 is ready for facility actions." : "Switch to CC3 before signing." : "Connect when you are ready to create the facility."}</small></div>{!wallet.account ? <button className="text-link" onClick={() => void wallet.connect()}>Connect wallet <Arrow /></button> : !wallet.correctNetwork ? <button className="text-link" onClick={() => void wallet.switchNetwork()}>Switch to CC3 <Arrow /></button> : null}</div>
    {step === 1 && <><h2>Who is this facility for?</h2><p className="lead">The connected wallet becomes the lender.</p><Field label="Borrower address" name="borrower" value={terms.borrower} onChange={update} hint="Full Creditcoin EVM address" /></>}
    {step === 2 && <><h2>Set the financial terms.</h2><p className="lead">Principal is native tCTC. APR entries are percentages.</p><div className="field-grid"><Field label="Principal" name="principal" type="number" value={terms.principal} onChange={update} suffix="tCTC" /><Field label="Standard APR" name="standardApr" type="number" value={terms.standardApr} onChange={update} suffix="%" /><Field label="Preferred APR" name="preferredApr" type="number" value={terms.preferredApr} onChange={update} suffix="%" /><Field label="Maturity" name="maturity" type="date" value={terms.maturity} onChange={update} /><Field label="Qualification deadline" name="qualificationDeadline" type="date" value={terms.qualificationDeadline} onChange={update} /></div></>}
    {step === 3 && <><h2>Define the preferred-rate condition.</h2><p className="lead">The borrower supplies this WETH reserve through their facility locker.</p><Field label="Required reserve" name="requiredReserve" type="number" value={terms.requiredReserve} onChange={update} suffix="WETH" /><div className="condition-review"><span className="mono">FACILITY SUMMARY</span><div><span>Principal</span><strong>{terms.principal || "0"} tCTC</strong></div><div><span>Rate improvement</span><strong>{terms.standardApr || "0"}% → <em>{terms.preferredApr || "0"}%</em></strong></div><p>Qualification closes {terms.qualificationDeadline || "before maturity"}. The facility matures {terms.maturity || "on the chosen date"}.</p></div><label className="check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I’ve reviewed the terms and condition.</label></>}
    {(formError || wallet.error) && <p className="form-error" role="alert">{formError ?? wallet.error}</p>}{result && <div className="transaction-result"><Status tone="positive">Facility submitted</Status><a href={explorerTx(result.transactionHash)} target="_blank" rel="noreferrer">Transaction {short(result.transactionHash)} <Arrow /></a><Link to={`/facilities/${result.facilityId}`}>Open facility →</Link></div>}
    <div className="form-actions">{step > 1 && !result && <button className="text-link" onClick={() => setStep(step - 1)}>← Back</button>}{!result && <button className="button button-dark" disabled={pending} onClick={step < 3 ? next : submit}>{pending ? "Confirm in wallet" : step < 3 ? "Continue" : !wallet.account ? "Connect wallet" : !wallet.correctNetwork ? "Switch to CC3" : "Create facility"}</button>}</div>
  </section></section></Shell>;
}

function FacilityWorkspace() {
  const { id } = useParams();
  const [drawer, setDrawer] = useState(false);
  const wallet = useWallet();
  const facilityId = id && /^0x[a-fA-F0-9]{64}$/.test(id) ? id : VERIFIED_DEPLOYMENT.facilityId;
  const live = useFacility(facilityId);
  const facility = live.data;
  const stateLabel = facility ? FACILITY_STATE_LABELS[facility.state] ?? "Unavailable" : "Loading chain state";
  const sameParty = Boolean(facility && facility.lender.toLowerCase() === facility.borrower.toLowerCase());
  const connectedAsLender = Boolean(wallet.account && facility && wallet.account.toLowerCase() === facility.lender.toLowerCase());
  const connectedAsBorrower = Boolean(wallet.account && facility && wallet.account.toLowerCase() === facility.borrower.toLowerCase());
  const roleLabel = facility ? sameParty ? `${short(facility.lender)} · Lender and borrower` : connectedAsLender ? `Connected as lender · ${short(facility.lender)}` : connectedAsBorrower ? `Connected as borrower · ${short(facility.borrower)}` : `${short(facility.borrower)} · Borrower` : "Loading facility details";
  return <Shell>
    <div className="workspace-back"><Link to="/facilities">← All facilities</Link><span className="mono">FACILITY · {short(facilityId)}</span></div>
    <section className="workspace-head grid" id="overview"><div><h1>Recorded working-capital facility</h1><p>{facility ? `${roleLabel}. Review the terms, rate condition, and evidence before you act.` : roleLabel}</p></div><Status tone={live.error ? "critical" : facility?.preferredRateActive ? "positive" : "neutral"}>{live.error ? "Data unavailable" : stateLabel}</Status></section>
    <nav className="workspace-tabs"><a className="active" href="#overview">Overview</a><a href="#activity">Evidence</a><a href="#terms">Terms</a><button onClick={() => setDrawer(true)}>View proof details <Arrow /></button></nav>
    {live.loading && <div className="chain-notice">Reading authoritative facility state from Creditcoin Testnet...</div>}
    {live.error && <div className="chain-notice chain-error"><span>{live.error}</span><button className="text-link" onClick={live.refresh}>Retry chain read</button></div>}
    <section className="workspace-numbers">
      <div className="principal"><span>Facility amount</span><strong>{facility ? formatCtc(facility.principal) : "Unavailable"}</strong><small>{facility ? `${formatCtc(facility.principal - facility.outstandingPrincipal)} undrawn` : "Awaiting chain state"}</small></div>
      <div><span>Standard APR</span><strong>{facility ? formatApr(facility.standardAprBps) : "Unavailable"}</strong><small>Base facility rate</small></div>
      <div><span>Preferred APR</span><strong className={facility?.preferredRateActive ? "green" : ""}>{facility ? formatApr(facility.preferredAprBps) : "Unavailable"}</strong><small>{facility?.preferredRateActive ? "Condition active" : "Condition rate"}</small></div>
      <div><span>Maturity</span><strong>{facility ? formatDate(facility.maturity).toUpperCase() : "Unavailable"}</strong><small>Fixed-term facility</small></div>
    </section>
    <section className="workspace-grid"><div className="workspace-main"><div className="panel-heading"><span className="mono">PREFERRED RATE CONDITION</span></div><NextAction facility={facility} onRefresh={live.refresh} /><div className="lifecycle"><div className="panel-heading"><span className="mono">FACILITY LIFECYCLE</span><span>{stateLabel}</span></div><CovenantLine active={facility?.preferredRateActive ? 4 : facility && hasProof(facility.qualificationProofId) ? 3 : facility && hasAddress(facility.reserveLocker) ? 2 : 1} labels={["Facility created", facility && hasAddress(facility.reserveLocker) ? "Locker bound" : "Locker pending", facility && hasProof(facility.qualificationProofId) ? "Proof accepted" : "Proof pending", facility?.preferredRateActive ? "Preferred active" : "Pending"]} /><div className="stage-list">{[["Facility funded",facility?.funded],["ReserveLocker bound",Boolean(facility && hasAddress(facility.reserveLocker))],["Condition active",facility?.preferredRateActive],["Facility drawn",facility?.drawn],["Maturity reached",facility ? Date.now()/1000 >= facility.maturity : false],["Repaid",facility?.repaid],["Reserve release recorded",facility?.reserveReleased],["Complete",facility?.state === 13]].map(([label,done], i) => <div className={done ? "done" : i === 3 && !facility?.drawn ? "current" : ""} key={String(label)}><i /><span>{String(label)}</span><small>{done ? "Confirmed" : "Pending"}</small></div>)}</div></div><div className="activity" id="activity"><div className="panel-heading"><span className="mono">AUTHORITATIVE EVIDENCE</span><button className="text-link" onClick={() => setDrawer(true)}>View proof details <Arrow /></button></div>{[["Preferred Rate Condition",facility?.preferredRateActive ? "Confirmed on CC3" : "Pending"],["Qualification source block",facility?.qualificationSourceBlock ? String(facility.qualificationSourceBlock) : "Unavailable"],["Locker binding source block",facility?.bindingSourceBlock ? String(facility.bindingSourceBlock) : "Unavailable"]].map(([a,b]) => <div className="activity-row" key={a}><i /><strong>{a}</strong><span className="mono">{b}</span></div>)}</div></div><aside className="terms" id="terms"><div className="panel-heading"><span className="mono">FACILITY TERMS</span></div>{[["Outstanding",facility ? formatCtc(facility.outstandingPrincipal) : "Unavailable"],["Required reserve",facility ? formatToken(facility.requiredReserveAmount, "WETH") : "Unavailable"],["Qualification deadline",facility ? formatDate(facility.qualificationDeadline) : "Unavailable"],["Lender",facility ? short(facility.lender) : "Unavailable"],["Borrower",facility ? short(facility.borrower) : "Unavailable"]].map(([a,b]) => <div key={a}><span>{a}</span><strong>{b}</strong></div>)}{facility && <a className="text-link" href={explorerAddress(VERIFIED_DEPLOYMENT.verdAddress)} target="_blank" rel="noreferrer">View contract deployment <Arrow /></a>}<button className="text-link" onClick={() => setDrawer(true)}>View all evidence <Arrow /></button></aside></section>{drawer && <EvidenceDrawer close={() => setDrawer(false)} facility={facility} />}
  </Shell>;
}

function NextAction({ facility, onRefresh }: { facility?: FacilityRecord; onRefresh?: () => Promise<void> }) {
  const wallet = useWallet();
  const [pending, setPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string>();
  const [lockerTransactionHash, setLockerTransactionHash] = useState<string>();
  const [reserveSupplyHash, setReserveSupplyHash] = useState<string>();
  const [releaseTransactionHash, setReleaseTransactionHash] = useState<string>();
  const [jobId, setJobId] = useState<string>();
  const [jobOperation, setJobOperation] = useState<"binding" | "qualification" | "release">();
  const [jobStatus, setJobStatus] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [sourceTxHash, setSourceTxHash] = useState("");
  const [sourceBlock, setSourceBlock] = useState("");
  const [sepoliaLocker, setSepoliaLocker] = useState<string>();
  const [jobComplete, setJobComplete] = useState(false);
  const isBorrower = Boolean(wallet.account && facility && wallet.account.toLowerCase() === facility.borrower.toLowerCase());
  const isLender = Boolean(wallet.account && facility && wallet.account.toLowerCase() === facility.lender.toLowerCase());
  const canQualify = Boolean(facility?.funded && hasAddress(facility.reserveLocker) && !facility.preferredRateActive && !facility.drawn && Date.now() / 1000 < facility.maturity);
  const needsLocker = Boolean(facility?.funded && !hasAddress(facility.reserveLocker) && !hasAddress(sepoliaLocker ?? "") && !facility.drawn && Date.now() / 1000 < facility.maturity);
  const bindingPending = Boolean(facility?.funded && !hasAddress(facility.reserveLocker) && hasAddress(sepoliaLocker ?? "") && !facility.drawn);
  const releaseUnlocked = Boolean(facility?.repaid && hasAddress(facility.reserveLocker) && Date.now() / 1000 >= facility.lockerUnlockTime);
  const canRelease = Boolean(releaseUnlocked && !facility?.reserveReleased && !releaseTransactionHash && !jobId);
  const releaseSourceReady = Boolean(facility?.repaid && !facility.reserveReleased && hasAddress(releaseTransactionHash ?? "") && !jobId);
  useEffect(() => {
    if (!facility || hasAddress(facility.reserveLocker)) return;
    void readReserveLocker(facility.id).then(locker => setSepoliaLocker(hasAddress(locker) ? locker : undefined)).catch(() => undefined);
  }, [facility]);
  useEffect(() => {
    if (!facility || hasAddress(facility.reserveLocker) || !lockerTransactionHash) return;
    let active = true;
    const poll = () => void readReserveLocker(facility.id).then(locker => { if (active && hasAddress(locker)) setSepoliaLocker(locker); }).catch(() => undefined);
    poll();
    const timer = window.setInterval(poll, 4_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [facility, lockerTransactionHash]);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const poll = () => void readQualificationJob(jobId).then(status => { if (active) { setJobStatus(status.terminal ? status.status : `${status.status} · ${status.nextAction}`); if (status.terminal && !jobComplete) { setJobComplete(true); void onRefresh?.(); } } }).catch(() => undefined);
    poll();
    const timer = window.setInterval(poll, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [jobId, jobComplete, onRefresh]);
  const canRepay = Boolean(facility?.drawn && !facility.repaid && Date.now() / 1000 >= facility.maturity);
  const act = async () => {
    setActionError(undefined);
    if (!wallet.account) { await wallet.connect(); return; }
    if (canRelease) {
      if (!isBorrower) { setActionError("Connect the borrower wallet to release the reserve."); return; }
      if (!wallet.sepoliaNetwork) { await wallet.switchSepolia(); return; }
      setPending(true);
      try { const hash = await releaseReserve(facility!.reserveLocker); setReleaseTransactionHash(hash); setSourceTxHash(hash); setSourceBlock(""); }
      catch (reason) { setActionError(reason instanceof Error ? reason.message : "The reserve was not released."); }
      finally { setPending(false); }
      return;
    }
    if (releaseSourceReady) {
      if (!isBorrower) { setActionError("Connect the borrower wallet to register the reserve release."); return; }
      if (!wallet.correctNetwork) { await wallet.switchNetwork(); return; }
      if (!/^0x[a-fA-F0-9]{64}$/.test(sourceTxHash)) { setActionError("Enter the Sepolia reserve release transaction hash."); return; }
      setPending(true);
      try { const result = await registerQualificationJob({ operation: "release", facilityId: facility!.id, sourceTxHash, sourceBlock: sourceBlock ? Number(sourceBlock) : undefined }); setJobOperation("release"); setJobId(result.job?.jobId); }
      catch (reason) { setActionError(reason instanceof Error ? reason.message : "The reserve release job was not registered."); }
      finally { setPending(false); }
      return;
    }
    if (needsLocker) {
      if (!isBorrower) { setActionError("Connect the borrower wallet to create the reserve locker."); return; }
      if (!wallet.sepoliaNetwork) { await wallet.switchSepolia(); return; }
      setPending(true);
      try { const hash = await createReserveLocker(facility!.id, facility!.borrower, facility!.maturity); setLockerTransactionHash(hash); setSourceTxHash(hash); }
      catch (reason) { setActionError(reason instanceof Error ? reason.message : "The reserve locker was not created."); }
      finally { setPending(false); }
      return;
    }
    if (bindingPending) {
      if (!isBorrower) { setActionError("Connect the borrower wallet to bind this reserve locker."); return; }
      if (!wallet.correctNetwork) { await wallet.switchNetwork(); return; }
      if (!/^0x[a-fA-F0-9]{64}$/.test(sourceTxHash)) { setActionError("Enter the Sepolia locker creation transaction hash."); return; }
      setPending(true);
      try { const result = await registerQualificationJob({ operation: "binding", facilityId: facility!.id, sourceTxHash, sourceBlock: sourceBlock ? Number(sourceBlock) : undefined }); setJobOperation("binding"); setJobId(result.job?.jobId); }
      catch (reason) { setActionError(reason instanceof Error ? reason.message : "The locker binding job was not registered."); }
      finally { setPending(false); }
      return;
    }
    if (canQualify && !reserveSupplyHash) {
      if (!isBorrower) { setActionError("Connect the borrower wallet to supply the reserve."); return; }
      if (!wallet.sepoliaNetwork) { await wallet.switchSepolia(); return; }
      setPending(true);
      try { const hash = await supplyReserve(facility!.reserveLocker, facility!.requiredReserveAmount); setReserveSupplyHash(hash); setSourceTxHash(hash); }
      catch (reason) { setActionError(reason instanceof Error ? reason.message : "The WETH reserve was not supplied."); }
      finally { setPending(false); }
      return;
    }
    if (!wallet.correctNetwork) { await wallet.switchNetwork(); return; }
    if (facility && !facility.funded && !isLender) { setActionError("Connect the lender wallet to fund this facility."); return; }
    if (canQualify && !isBorrower) { setActionError("Connect the borrower wallet to register qualification."); return; }
    if (facility?.funded && !canQualify && !isBorrower) { setActionError(canRepay ? "Connect the borrower wallet to repay this facility." : "Connect the borrower wallet to draw this facility."); return; }
    setPending(true);
    try {
      if (canQualify) {
        if (!/^0x[a-fA-F0-9]{64}$/.test(sourceTxHash)) throw new Error("Enter the Sepolia source transaction hash.");
        const result = await registerQualificationJob({ facilityId: facility!.id, sourceTxHash, sourceBlock: sourceBlock ? Number(sourceBlock) : undefined });
        setJobOperation("qualification");
        setJobId(result.job?.jobId);
      } else if (canRepay) {
        setTransactionHash(await repayFacility(facility!.id, estimateRepayment(facility!)));
      } else {
        setTransactionHash(await (facility && !facility.funded ? fundFacility(facility.id, facility.principal) : drawFacility(facility!.id)));
      }
    }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "The draw transaction was not submitted."); }
    finally { setPending(false); }
  };
  if (!facility) return <div className="next-action"><div><Status>Reading chain state</Status><h2>The next valid action will appear after the facility loads.</h2></div></div>;
  if (!facility.funded) return <div className="next-action"><div><Status>Funding pending</Status><h2>Fund {formatCtc(facility.principal)} to activate this facility.</h2><p>Only the lender address recorded on the facility can fund it.</p>{actionError && <small className="action-message critical">{actionError}</small>}{transactionHash && <a className="action-message" href={explorerTx(transactionHash)} target="_blank" rel="noreferrer">Transaction submitted · {short(transactionHash)} <Arrow /></a>}</div><button className="button button-dark" disabled={pending || Boolean(transactionHash)} onClick={act}>{transactionHash ? "Transaction submitted" : pending ? "Confirming in wallet" : !wallet.account ? "Connect wallet to fund" : !wallet.correctNetwork ? "Switch to CC3" : "Fund facility"}</button></div>;
   if (facility.reserveReleased) return <div className="next-action"><div><Status tone="positive">Facility complete</Status><h2>The reserve was released and the facility is complete.</h2><p>Repayment and reserve release are both recorded onchain. Review the evidence surface for the release proof.</p></div></div>;
   if (facility.repaid && releaseSourceReady) return <div className="next-action"><div><Status>Release transaction ready</Status><h2>Register the reserve release for verification.</h2><p>The Sepolia release is complete. Sign once with the borrower wallet so Verd can verify it and record completion on Creditcoin.</p><div className="qualification-fields"><input aria-label="Sepolia reserve release transaction hash" placeholder="Sepolia reserve release transaction hash" value={sourceTxHash} readOnly /><input aria-label="Source block number" placeholder="Source block (optional)" inputMode="numeric" value={sourceBlock} onChange={event => setSourceBlock(event.target.value)} /></div>{actionError && <small className="action-message critical">{actionError}</small>}<a className="action-message" href={`https://sepolia.etherscan.io/tx/${releaseTransactionHash}`} target="_blank" rel="noreferrer">Release transaction · {short(releaseTransactionHash!)} <Arrow /></a></div><button className="button button-dark" disabled={pending} onClick={act}>{pending ? "Sign in wallet" : !wallet.account ? "Connect wallet" : !wallet.correctNetwork ? "Switch to CC3" : "Register release"}</button></div>;
   if (facility.repaid && canRelease) return <div className="next-action"><div><Status tone="warning">Reserve releasable</Status><h2>Release the reserve on Sepolia.</h2><p>The facility is repaid and the locker has reached its unlock time. Release the borrower-authorized reserve, then register the source transaction for verification.</p>{wallet.error && <small className="action-message critical">{wallet.error}</small>}{actionError && <small className="action-message critical">{actionError}</small>}</div><button className="button button-dark" disabled={pending} onClick={act}>{pending ? "Confirm in wallet" : !wallet.account ? "Connect wallet" : !wallet.sepoliaNetwork ? "Switch to Sepolia" : "Release reserve"}</button></div>;
   if (facility.repaid && jobOperation === "release" && jobId) return <div className="next-action"><div><Status>Release verification in progress</Status><h2>Verd is checking the reserve release.</h2><p>The worker is verifying the Sepolia receipt and recording the release proof on Creditcoin.</p>{jobStatus && <small className="action-message mono">JOB STATUS · {jobStatus}</small>}{actionError && <small className="action-message critical">{actionError}</small>}</div></div>;
   if (facility.repaid) return <div className="next-action"><div><Status tone="positive">Facility repaid</Status><h2>The facility was repaid at {formatApr(facility.currentAprBps)} APR.</h2><p>The reserve stays locked until {formatDate(facility.lockerUnlockTime)}. Verd will show the release action when it becomes available.</p></div></div>;
  if (facility.drawn && !canRepay) return <div className="next-action"><div><Status tone="positive">Draw confirmed</Status><h2>{formatCtc(facility.outstandingPrincipal)} is outstanding at {formatApr(facility.currentAprBps)} APR.</h2><p>Repayment becomes available at maturity.</p></div></div>;
  if (needsLocker) return <div className="next-action"><div><Status>Reserve setup</Status><h2>Create the facility reserve locker on Sepolia.</h2><p>The borrower creates one immutable locker before WETH can be supplied and authenticated to this facility.</p>{actionError && <small className="action-message critical">{actionError}</small>}{lockerTransactionHash && <a className="action-message" href={`https://sepolia.etherscan.io/tx/${lockerTransactionHash}`} target="_blank" rel="noreferrer">Locker transaction submitted · {short(lockerTransactionHash)} <Arrow /></a>}</div><button className="button button-dark" disabled={pending || Boolean(lockerTransactionHash)} onClick={act}>{lockerTransactionHash ? "Locker submitted" : pending ? "Confirm in wallet" : !wallet.account ? "Connect wallet" : !wallet.sepoliaNetwork ? "Switch to Sepolia" : "Create reserve locker"}</button></div>;
   if (bindingPending) return <div className="next-action"><div><Status>Locker created</Status><h2>Bind the reserve locker to this facility.</h2><p>Review the captured Sepolia transaction, then register it with the borrower wallet. Verd will verify the factory event and submit the CC3 binding proof.</p><div className="qualification-fields"><input aria-label="Locker creation transaction hash" placeholder="Sepolia locker creation transaction hash" value={sourceTxHash} readOnly={Boolean(lockerTransactionHash)} onChange={event => setSourceTxHash(event.target.value)} /><input aria-label="Locker creation block number" placeholder="Source block (optional)" inputMode="numeric" value={sourceBlock} onChange={event => setSourceBlock(event.target.value)} /></div><small className="mono">SEPOLIA LOCKER · {short(sepoliaLocker!)}</small>{wallet.error && <small className="action-message critical">{wallet.error}</small>}{actionError && <small className="action-message critical">{actionError}</small>}{jobId && <span className="action-message">Binding job registered · {short(jobId)}</span>}{jobStatus && <small className="action-message mono">JOB STATUS · {jobStatus}</small>}</div><button className="button button-dark" disabled={pending || Boolean(jobId)} onClick={act}>{jobId ? "Binding job registered" : pending ? "Sign in wallet" : !wallet.account ? "Connect wallet" : !wallet.correctNetwork ? "Switch to CC3" : "Register locker binding"}</button></div>;
  if (canRepay) return <div className="next-action"><div><Status tone="warning">Repayment due</Status><h2>Repay approximately {formatCtc(estimateRepayment(facility))} to close this facility.</h2><p>The contract recalculates interest at submission. The amount shown is a current estimate.</p>{wallet.error && <small className="action-message critical">{wallet.error}</small>}{actionError && <small className="action-message critical">{actionError}</small>}{transactionHash && <a className="action-message" href={explorerTx(transactionHash)} target="_blank" rel="noreferrer">Transaction submitted · {short(transactionHash)} <Arrow /></a>}</div><button className="button button-dark" disabled={pending || Boolean(transactionHash)} onClick={act}>{transactionHash ? "Transaction submitted" : pending ? "Confirming in wallet" : !wallet.account ? "Connect wallet to repay" : !wallet.correctNetwork ? "Switch to CC3" : "Repay facility"}</button></div>;
  if (Date.now() / 1000 >= facility.maturity) return <div className="next-action recovery"><div><Status tone="critical">Matured before draw</Status><h2>This facility can’t be drawn after {formatDate(facility.maturity)}.</h2><p>The contract rejects draws at or after maturity. No transaction is offered for this state.</p></div></div>;
  if (canQualify) return <div className="next-action"><div><Status>{reserveSupplyHash ? "Qualification required" : "Reserve supply"}</Status><h2>{reserveSupplyHash ? "Register the reserve transaction for review." : `Supply ${formatToken(facility.requiredReserveAmount, "WETH")} to the facility locker.`}</h2><p>{reserveSupplyHash ? "Sign once with the borrower wallet. The worker secret stays on the server." : "The borrower supplies WETH through the authenticated Sepolia locker before qualification."}</p>{reserveSupplyHash && <div className="qualification-fields"><input aria-label="Sepolia source transaction hash" placeholder="Sepolia source transaction hash" value={sourceTxHash} readOnly onChange={event => setSourceTxHash(event.target.value)} /><input aria-label="Source block number" placeholder="Source block (optional)" inputMode="numeric" value={sourceBlock} onChange={event => setSourceBlock(event.target.value)} /></div>}{wallet.error && <small className="action-message critical">{wallet.error}</small>}{actionError && <small className="action-message critical">{actionError}</small>}{reserveSupplyHash && <a className="action-message" href={`https://sepolia.etherscan.io/tx/${reserveSupplyHash}`} target="_blank" rel="noreferrer">Supply transaction · {short(reserveSupplyHash)} <Arrow /></a>}{jobId && <span className="action-message">Job registered · {short(jobId)}</span>}{jobStatus && <small className="action-message mono">JOB STATUS · {jobStatus}</small>}</div><button className="button button-dark" disabled={pending || Boolean(jobId)} onClick={act}>{jobId ? "Job registered" : pending ? "Confirm in wallet" : !wallet.account ? "Connect wallet" : !reserveSupplyHash && !wallet.sepoliaNetwork ? "Switch to Sepolia" : reserveSupplyHash && !wallet.correctNetwork ? "Switch to CC3" : reserveSupplyHash ? "Register qualification" : "Supply reserve"}</button></div>;
  return <div className="next-action"><div><Status tone={facility.preferredRateActive ? "positive" : "neutral"}>{facility.preferredRateActive ? "Preferred rate active" : "Standard rate available"}</Status><h2>{formatCtc(facility.principal)} is available at {formatApr(facility.currentAprBps)} APR.</h2><p>The facility is funded and the current rate comes directly from Creditcoin contract state.</p>{wallet.error && <small className="action-message critical">{wallet.error}</small>}{actionError && <small className="action-message critical">{actionError}</small>}{transactionHash && <a className="action-message" href={explorerTx(transactionHash)} target="_blank" rel="noreferrer">Transaction submitted · {short(transactionHash)} <Arrow /></a>}</div><button className="button button-dark" disabled={pending || Boolean(transactionHash)} onClick={act}>{transactionHash ? "Transaction submitted" : pending ? "Confirming in wallet" : !wallet.account ? "Connect wallet to draw" : !wallet.correctNetwork ? "Switch to CC3" : "Draw facility"}</button></div>;
}
function EvidenceDrawer({ close, facility }: { close: () => void; facility?: FacilityRecord }) {
  const hasPublishedReference = facility?.id.toLowerCase() === VERIFIED_DEPLOYMENT.facilityId.toLowerCase();
  const lockerBound = hasAddress(facility?.reserveLocker ?? "");
  const reserveVerified = hasProof(facility?.qualificationProofId ?? "");
  const items: [string, string, Tone, string, string, string | undefined][] = [
    ["Ethereum reserve", reserveVerified ? "Confirmed" : "Pending", reserveVerified ? "positive" : "neutral", facility ? `Aave Supply · ${formatToken(facility.requiredReserveAmount, "WETH")}` : "State unavailable", facility?.qualificationSourceBlock ? `Source block ${facility.qualificationSourceBlock}` : "Source block unavailable", hasPublishedReference ? VERIFIED_EVIDENCE.sepoliaExplorerUrl + VERIFIED_EVIDENCE.reserveSupplyTx : undefined],
    ["ReserveLocker binding", lockerBound && hasProof(facility?.bindingProofId ?? "") ? "Verified" : "Pending", lockerBound && hasProof(facility?.bindingProofId ?? "") ? "positive" : "neutral", facility && lockerBound ? short(facility.reserveLocker) : "Locker unavailable", facility?.bindingSourceBlock ? `Source block ${facility.bindingSourceBlock}` : "Source block unavailable", hasPublishedReference ? explorerTx(VERIFIED_EVIDENCE.lockerBindingTx) : undefined],
    ["Creditcoin qualification", facility?.preferredRateActive ? "Confirmed" : "Pending", facility?.preferredRateActive ? "positive" : "neutral", "Preferred Rate Condition", hasProof(facility?.qualificationProofId ?? "") ? `Proof ${short(facility!.qualificationProofId)}` : "Proof unavailable", hasPublishedReference ? explorerTx(VERIFIED_EVIDENCE.qualificationTx) : undefined],
     ["Repayment", facility?.repaid ? "Confirmed" : "Unavailable", facility?.repaid ? "positive" : "neutral", facility?.repaid ? formatCtc(facility.repaidAmount) : "No repayment recorded", "Available only after an authoritative transaction", undefined],
     ["Reserve release", facility?.reserveReleased ? "Confirmed" : facility?.repaid ? "Ready after unlock" : "Pending", facility?.reserveReleased ? "positive" : facility?.repaid ? "warning" : "neutral", facility?.reserveReleased ? formatToken(facility.reserveReleaseAmount, "WETH") : "No release recorded", facility?.releaseSourceBlock ? `Source block ${facility.releaseSourceBlock}` : "Source block unavailable", undefined],
  ];
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Facility evidence"><button className="drawer-backdrop" onClick={close} aria-label="Close evidence" /><aside className="drawer"><div className="drawer-head"><div><span className="mono">{short(facility?.id ?? VERIFIED_DEPLOYMENT.facilityId)}</span><h2>Execution evidence</h2></div><button onClick={close} aria-label="Close">×</button></div><p className="drawer-intro">Real records supporting this facility state. Chain state remains authoritative.</p>{items.map(([title,status,tone,main,meta,href]) => <div className="evidence-item" key={title}><div><span className="mono">{title}</span><Status tone={tone}>{status}</Status></div><strong>{main}</strong><small className="mono">{meta}</small>{href ? <a className="text-link" href={href} target="_blank" rel="noreferrer">Inspect record <Arrow /></a> : <span className="evidence-unavailable">No external record available</span>}</div>)}</aside></div>;
}

function Docs() { return <Shell><DocsContent /></Shell>; }

function NotFound() { return <Shell><section className="not-found"><span className="mono">404</span><h1>This page is unavailable.</h1><Link className="button button-dark" to="/">Return home</Link></section></Shell>; }
export function App() { return <Routes><Route path="/" element={<Home />} /><Route path="/facilities" element={<Facilities />} /><Route path="/facilities/:id" element={<FacilityWorkspace />} /><Route path="/create" element={<CreateFacility />} /><Route path="/privacy" element={<LegalPage kind="privacy" />} /><Route path="/terms" element={<LegalPage kind="terms" />} /><Route path="/docs/*" element={<Docs />} /><Route path="*" element={<NotFound />} /></Routes>; }
